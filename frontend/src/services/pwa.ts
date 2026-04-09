/**
 * PWA Service Worker 配置
 * 
 * 该文件提供 Service Worker 的注册和管理功能
 */

// Service Worker 更新检查间隔（毫秒）
const SW_UPDATE_INTERVAL = 60 * 60 * 1000 // 1小时

/**
 * 注册 Service Worker
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    console.log('[PWA] Service Worker 不支持')
    return null
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    })

    console.log('[PWA] Service Worker 注册成功:', registration.scope)

    // 检查更新
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing
      if (!newWorker) return

      console.log('[PWA] 发现新版本 Service Worker')

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          console.log('[PWA] 新版本已可用')
          // 可以在这里触发更新提示
        }
      })
    })

    return registration
  } catch (error) {
    console.error('[PWA] Service Worker 注册失败:', error)
    return null
  }
}

/**
 * 取消注册 Service Worker
 */
export async function unregisterServiceWorker(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) {
    return false
  }

  const registration = await navigator.serviceWorker.ready
  if (!registration) return false

  try {
    await registration.unregister()
    console.log('[PWA] Service Worker 已取消注册')
    return true
  } catch (error) {
    console.error('[PWA] 取消注册失败:', error)
    return false
  }
}

/**
 * 请求通知权限
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    console.log('[PWA] 通知不支持')
    return 'denied'
  }

  if (Notification.permission === 'granted') {
    return 'granted'
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission()
    return permission
  }

  return Notification.permission
}

/**
 * 显示本地通知
 */
export function showLocalNotification(title: string, options?: NotificationOptions): void {
  if (Notification.permission === 'granted') {
    new Notification(title, {
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      ...options,
    })
  }
}

/**
 * 检查应用更新
 */
export function checkForUpdates(): void {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then((registration) => {
      if ('update' in registration) {
        (registration as ServiceWorkerRegistration & { update: () => void }).update()
      }
    })
  }
}

// 定期检查更新
setInterval(checkForUpdates, SW_UPDATE_INTERVAL)

// 页面可见性变化时检查更新
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    checkForUpdates()
  }
})
