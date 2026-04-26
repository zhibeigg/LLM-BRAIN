import { broadcast } from '../../ws/server.js'
import { randomUUID } from 'crypto'
import { Mutex } from 'async-mutex'
import type { QueueItem, ExecutionMode } from '../../types/index.js'

/**
 * 任务队列管理器
 * 职责：队列的增删改查、状态广播
 */
export class TaskQueue {
  private _queue: QueueItem[] = []
  private _isRunning = false
  private mutex = new Mutex()

  /** 获取队列是否正在运行 */
  get isRunning(): boolean {
    return this._isRunning
  }

  /** 设置运行状态（线程安全） */
  set isRunning(value: boolean) {
    this._isRunning = value
  }

  /** 获取队列副本（线程安全） */
  get items(): QueueItem[] {
    return [...this._queue]
  }

  /**
   * 添加任务到队列
   * @returns 返回新添加的队列项
   */
  async enqueue(type: 'task' | 'learn', prompt: string, brainId: string): Promise<QueueItem> {
    const item: QueueItem = {
      id: randomUUID(),
      type,
      prompt,
      brainId,
      createdAt: Date.now(),
    }

    await this.enqueueItem(item)
    return item
  }

  /** 添加已有任务项到等待队列 */
  async enqueueItem(item: QueueItem): Promise<void> {
    const release = await this.mutex.acquire()
    try {
      this._queue.push(item)
      this._broadcastQueue()
    } finally {
      release()
    }
  }

  /**
   * 从队列中移除指定任务
   * @returns 是否成功移除
   */
  async remove(id: string): Promise<boolean> {
    const release = await this.mutex.acquire()
    try {
      const idx = this._queue.findIndex(q => q.id === id)
      if (idx === -1) return false
      this._queue.splice(idx, 1)
      this._broadcastQueue()
      return true
    } finally {
      release()
    }
  }

  /**
   * 取出下一个待执行任务（从队列头部）
   */
  async shift(): Promise<QueueItem | undefined> {
    const release = await this.mutex.acquire()
    try {
      const item = this._queue.shift()
      if (item) this._broadcastQueue()
      return item
    } finally {
      release()
    }
  }

  /**
   * 获取队列长度
   */
  get length(): number {
    return this._queue.length
  }

  /** 广播队列状态给前端 */
  private _broadcastQueue() {
    broadcast('queue_update', { queue: this._queue })
  }
}
