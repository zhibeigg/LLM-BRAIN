use log::{error, info, warn};
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpStream};
use std::sync::Mutex;
use std::time::Duration;
use tauri::Manager;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

struct BackendProcess(Mutex<Option<CommandChild>>);

fn backend_port() -> &'static str {
    "3715"
}

fn wait_for_backend() {
    let addr = SocketAddr::new(
        IpAddr::V4(Ipv4Addr::LOCALHOST),
        backend_port().parse::<u16>().unwrap_or(3715),
    );

    for _ in 0..60 {
        if TcpStream::connect_timeout(&addr, Duration::from_millis(250)).is_ok() {
            info!("LLM-BRAIN 后端已就绪");
            return;
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    warn!("等待 LLM-BRAIN 后端就绪超时，前端会继续尝试连接");
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir)?;

            let backend_entry = app
                .path()
                .resource_dir()?
                .join("backend")
                .join("dist")
                .join("index.js");

            let sidecar = app
                .shell()
                .sidecar("llm-brain-node")?
                .args([backend_entry.to_string_lossy().to_string()])
                .env("NODE_ENV", "production")
                .env("PORT", backend_port())
                .env("LLM_BRAIN_DATA_DIR", app_data_dir.to_string_lossy().to_string());

            let (mut rx, child) = sidecar.spawn()?;
            app.manage(BackendProcess(Mutex::new(Some(child))));

            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            info!("[backend] {}", String::from_utf8_lossy(&line));
                        }
                        CommandEvent::Stderr(line) => {
                            warn!("[backend] {}", String::from_utf8_lossy(&line));
                        }
                        CommandEvent::Terminated(payload) => {
                            error!("LLM-BRAIN 后端进程已退出: {:?}", payload);
                            break;
                        }
                        _ => {}
                    }
                }
            });

            wait_for_backend();
            info!("LLM-BRAIN 应用已启动");
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                if let Some(process) = window.app_handle().try_state::<BackendProcess>() {
                    if let Ok(mut child) = process.0.lock() {
                        if let Some(child) = child.take() {
                            let _ = child.kill();
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
