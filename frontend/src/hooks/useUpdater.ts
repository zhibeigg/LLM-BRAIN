import { check } from '@tauri-apps/plugin-updater';
import { listen } from '@tauri-apps/api/event';
import { relaunch } from '@tauri-apps/plugin-process';
import { useEffect, useState, useCallback } from 'react';

export interface UpdateInfo {
  version: string;
  latestVersion: string;
  date?: string;
  body?: string;
}

export interface UpdateState {
  update: UpdateInfo | null;
  isChecking: boolean;
  isDownloading: boolean;
  downloadProgress: number;
  error: string | null;
}

export function useUpdater() {
  const [state, setState] = useState<UpdateState>({
    update: null,
    isChecking: false,
    isDownloading: false,
    downloadProgress: 0,
    error: null,
  });

  // 监听后端发出的更新事件
  useEffect(() => {
    const unlisten = listen<UpdateInfo>('update-available', (event) => {
      setState((prev) => ({
        ...prev,
        update: event.payload,
      }));
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // 手动检查更新
  const checkForUpdates = useCallback(async () => {
    setState((prev) => ({ ...prev, isChecking: true, error: null }));
    try {
      const update = await check();
      if (update) {
        setState((prev) => ({
          ...prev,
          update: {
            version: update.version,
            latestVersion: update.version,
            date: update.date,
            body: update.body,
          },
        }));
      }
    } catch (e) {
      setState((prev) => ({
        ...prev,
        error: e instanceof Error ? e.message : '检查更新失败',
      }));
    } finally {
      setState((prev) => ({ ...prev, isChecking: false }));
    }
  }, []);

  // 下载并安装更新
  const downloadAndInstall = useCallback(async () => {
    if (!state.update) return;

    setState((prev) => ({ ...prev, isDownloading: true, downloadProgress: 0 }));
    try {
      const update = await check();
      if (update) {
        await update.downloadAndInstall((event) => {
          if (event.event === 'Progress') {
            const progress = event.data as { chunkLength: number; contentLength: number };
            const percent = (progress.chunkLength / progress.contentLength) * 100;
            setState((prev) => ({ ...prev, downloadProgress: percent }));
          }
        });
        // 下载完成后重启应用
        await relaunch();
      }
    } catch (e) {
      setState((prev) => ({
        ...prev,
        error: e instanceof Error ? e.message : '下载更新失败',
        isDownloading: false,
      }));
    }
  }, [state.update]);

  // 清除错误
  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  return {
    ...state,
    checkForUpdates,
    downloadAndInstall,
    clearError,
  };
}
