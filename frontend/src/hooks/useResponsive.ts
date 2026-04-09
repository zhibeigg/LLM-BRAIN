import { useState, useEffect, useCallback } from 'react'

export type Breakpoint = 'mobile' | 'tablet' | 'desktop'

interface UseResponsiveReturn {
  breakpoint: Breakpoint
  isMobile: boolean
  isTablet: boolean
  isDesktop: boolean
  windowWidth: number
  windowHeight: number
}

/** 响应式断点检测 Hook */
export function useResponsive(): UseResponsiveReturn {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(() => {
    if (typeof window === 'undefined') return 'desktop'
    const width = window.innerWidth
    if (width < 768) return 'mobile'
    if (width < 1024) return 'tablet'
    return 'desktop'
  })

  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1200
  )
  const [windowHeight, setWindowHeight] = useState(
    typeof window !== 'undefined' ? window.innerHeight : 800
  )

  const updateBreakpoint = useCallback(() => {
    const width = window.innerWidth
    setWindowWidth(width)
    setWindowHeight(window.innerHeight)

    let newBreakpoint: Breakpoint = 'desktop'
    if (width < 768) {
      newBreakpoint = 'mobile'
    } else if (width < 1024) {
      newBreakpoint = 'tablet'
    }

    setBreakpoint((prev) => {
      if (prev !== newBreakpoint) {
        return newBreakpoint
      }
      return prev
    })
  }, [])

  useEffect(() => {
    // 初始化
    updateBreakpoint()

    // 监听窗口大小变化
    window.addEventListener('resize', updateBreakpoint)
    window.addEventListener('orientationchange', updateBreakpoint)

    return () => {
      window.removeEventListener('resize', updateBreakpoint)
      window.removeEventListener('orientationchange', updateBreakpoint)
    }
  }, [updateBreakpoint])

  return {
    breakpoint,
    isMobile: breakpoint === 'mobile',
    isTablet: breakpoint === 'tablet',
    isDesktop: breakpoint === 'desktop',
    windowWidth,
    windowHeight,
  }
}

/** 移动端触摸事件处理 Hook */
export function useTouchGestures(
  elementRef: React.RefObject<HTMLElement>,
  options: {
    onSwipeLeft?: () => void
    onSwipeRight?: () => void
    onSwipeUp?: () => void
    onSwipeDown?: () => void
    onLongPress?: () => void
    threshold?: number
    longPressDelay?: number
  } = {}
) {
  const {
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
    onLongPress,
    threshold = 50,
    longPressDelay = 500,
  } = options

  useEffect(() => {
    const element = elementRef.current
    if (!element) return

    let startX = 0
    let startY = 0
    let startTime = 0
    let longPressTimer: ReturnType<typeof setTimeout> | null = null

    const handleTouchStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
      startTime = Date.now()

      if (onLongPress) {
        longPressTimer = setTimeout(() => {
          onLongPress()
        }, longPressDelay)
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      // 如果移动距离超过阈值，取消长按
      if (longPressTimer) {
        const moveX = Math.abs(e.touches[0].clientX - startX)
        const moveY = Math.abs(e.touches[0].clientY - startY)
        if (moveX > 10 || moveY > 10) {
          clearTimeout(longPressTimer)
          longPressTimer = null
        }
      }
    }

    const handleTouchEnd = (e: TouchEvent) => {
      if (longPressTimer) {
        clearTimeout(longPressTimer)
        longPressTimer = null
      }

      const endX = e.changedTouches[0].clientX
      const endY = e.changedTouches[0].clientY
      const deltaX = endX - startX
      const deltaY = endY - startY
      const elapsed = Date.now() - startTime

      // 忽略太快的滑动（可能是误触）
      if (elapsed > 500) return

      // 检查是否是有效的滑动
      if (Math.abs(deltaX) > threshold && Math.abs(deltaX) > Math.abs(deltaY)) {
        if (deltaX > 0 && onSwipeRight) {
          onSwipeRight()
        } else if (deltaX < 0 && onSwipeLeft) {
          onSwipeLeft()
        }
      } else if (Math.abs(deltaY) > threshold && Math.abs(deltaY) > Math.abs(deltaX)) {
        if (deltaY > 0 && onSwipeDown) {
          onSwipeDown()
        } else if (deltaY < 0 && onSwipeUp) {
          onSwipeUp()
        }
      }
    }

    element.addEventListener('touchstart', handleTouchStart, { passive: true })
    element.addEventListener('touchmove', handleTouchMove, { passive: true })
    element.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      element.removeEventListener('touchstart', handleTouchStart)
      element.removeEventListener('touchmove', handleTouchMove)
      element.removeEventListener('touchend', handleTouchEnd)
      if (longPressTimer) {
        clearTimeout(longPressTimer)
      }
    }
  }, [elementRef, onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown, onLongPress, threshold, longPressDelay])
}

/** 双击/单击检测 Hook */
export function useTapDetection(
  elementRef: React.RefObject<HTMLElement>,
  onSingleTap: () => void,
  onDoubleTap: () => void,
  delay = 300
) {
  useEffect(() => {
    const element = elementRef.current
    if (!element) return

    let lastTap = 0

    const handleClick = () => {
      const now = Date.now()
      if (now - lastTap < delay) {
        onDoubleTap()
        lastTap = 0
      } else {
        lastTap = now
        setTimeout(() => {
          if (lastTap === now) {
            onSingleTap()
          }
        }, delay)
      }
    }

    element.addEventListener('click', handleClick)
    return () => element.removeEventListener('click', handleClick)
  }, [elementRef, onSingleTap, onDoubleTap, delay])
}
