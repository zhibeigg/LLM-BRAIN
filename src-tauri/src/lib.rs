use log::info;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();
    
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            info!("LLM-BRAIN 应用已启动");
            
            // 异步检查更新
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                check_for_updates(handle).await;
            });
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

async fn check_for_updates(app: tauri::AppHandle) {
    use tauri_plugin_updater::UpdaterExt;
    
    match app.updater() {
        Ok(updater) => {
            match updater.check().await {
                Ok(Some(update)) => {
                    info!("发现新版本: {} -> {}", update.version, update.latest_version);
                    // 广播更新事件到前端
                    if let Err(e) = app.emit("update-available", &update) {
                        log::error!("发送更新事件失败: {}", e);
                    }
                }
                Ok(None) => {
                    info!("当前已是最新版本");
                }
                Err(e) => {
                    log::error!("检查更新失败: {}", e);
                }
            }
        }
        Err(e) => {
            log::error!("获取更新器失败: {}", e);
        }
    }
}
