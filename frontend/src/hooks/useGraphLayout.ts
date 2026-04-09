/**
 * 图谱布局 Worker Hook
 * 封装Web Worker的创建、通信和错误处理
 */

import { useCallback, useRef, useState } from 'react'
import type { MemoryNode, MemoryEdge } from '../types'
import type { LayoutOptions, LayoutWorkerResponse } from '../workers/graphLayout.worker'

/** 布局状态 */
export interface UseGraphLayoutState {
  isLayouting: boolean
  progress: number
  error: string | null
}

/** 布局结果 */
export interface LayoutResult {
  nodes: Array<{ id: string; x: number; y: number }>
}

/**
 * Hook: 使用Web Worker进行图谱布局计算
 * @param onComplete 布局完成后的回调
 * @returns 布局控制函数和状态
 */
export function useGraphLayout(
  onComplete?: (result: LayoutResult) => void
) {
  const workerRef = useRef<Worker | null>(null)
  const [state, setState] = useState<UseGraphLayoutState>({
    isLayouting: false,
    progress: 0,
    error: null,
  })

  /**
   * 启动布局计算
   */
  const startLayout = useCallback((
    nodes: MemoryNode[],
    edges: MemoryEdge[],
    options?: LayoutOptions
  ) => {
    // 清理之前的Worker
    if (workerRef.current) {
      workerRef.current.terminate()
    }

    setState({
      isLayouting: true,
      progress: 0,
      error: null,
    })

    // 创建新的Worker
    const worker = new Worker(
      new URL('../workers/graphLayout.worker.ts', import.meta.url),
      { type: 'module' }
    )
    workerRef.current = worker

    // 设置错误处理
    worker.onerror = (error) => {
      console.error('布局Worker错误:', error)
      setState({
        isLayouting: false,
        progress: 0,
        error: '布局计算失败',
      })
    }

    // 设置消息处理
    worker.onmessage = (event: MessageEvent<LayoutWorkerResponse>) => {
      const { type, nodes, progress, error } = event.data

      switch (type) {
        case 'progress':
          setState(prev => ({
            ...prev,
            progress: progress ?? prev.progress,
          }))
          break

        case 'complete':
          setState({
            isLayouting: false,
            progress: 1,
            error: null,
          })
          onComplete?.({ nodes: nodes ?? [] })
          // 清理Worker
          worker.terminate()
          workerRef.current = null
          break

        case 'error':
          setState({
            isLayouting: false,
            progress: 0,
            error: error ?? '未知错误',
          })
          // 清理Worker
          worker.terminate()
          workerRef.current = null
          break
      }
    }

    // 发送开始消息
    worker.postMessage({
      type: 'start',
      nodes,
      edges,
      options,
    })
  }, [onComplete])

  /**
   * 停止布局计算
   */
  const stopLayout = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'stop' })
      workerRef.current.terminate()
      workerRef.current = null
    }
    setState({
      isLayouting: false,
      progress: 0,
      error: null,
    })
  }, [])

  return {
    ...state,
    startLayout,
    stopLayout,
  }
}
