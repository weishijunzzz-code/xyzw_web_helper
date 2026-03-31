import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { useGlobalErrorHandler } from './useGlobalErrorHandler'

// Mock Naive UI
vi.mock('naive-ui', () => ({
  useMessage: () => ({
    error: vi.fn()
  }),
  useDialog: () => ({
    error: vi.fn()
  }),
  useNotification: () => ({
    error: vi.fn()
  })
}))

describe('useGlobalErrorHandler', () => {
  let handler: ReturnType<typeof useGlobalErrorHandler>

  beforeEach(() => {
    handler = useGlobalErrorHandler({ silent: true })
  })

  afterEach(() => {
    handler.clearHistory()
    handler.destroy()
  })

  describe('addError', () => {
    it('应该添加错误到历史记录', () => {
      const error = new Error('测试错误')
      const result = handler.addError(error, 'js')

      expect(result).toHaveProperty('id')
      expect(result).toHaveProperty('timestamp')
      expect(result.message).toBe('测试错误')
      expect(result.type).toBe('js')
      expect(result.resolved).toBe(false)
    })

    it('应该限制历史记录数量', () => {
      // 添加超过50个错误
      for (let i = 0; i < 55; i++) {
        handler.addError(new Error(`错误 ${i}`), 'js')
      }

      expect(handler.errorHistory.value.length).toBe(50)
    })
  })

  describe('resolveError', () => {
    it('应该标记错误为已解决', () => {
      const error = handler.addError(new Error('测试错误'), 'js')
      handler.resolveError(error.id)

      const resolvedError = handler.errorHistory.value.find(e => e.id === error.id)
      expect(resolvedError?.resolved).toBe(true)
    })
  })

  describe('getUnresolvedErrors', () => {
    it('应该返回未解决的错误', () => {
      const error1 = handler.addError(new Error('错误1'), 'js')
      const error2 = handler.addError(new Error('错误2'), 'js')
      handler.resolveError(error1.id)

      const unresolved = handler.getUnresolvedErrors()
      expect(unresolved.length).toBe(1)
      expect(unresolved[0].id).toBe(error2.id)
    })
  })

  describe('withRetry', () => {
    it('应该在失败后重试', async () => {
      let attempts = 0
      const fn = vi.fn().mockImplementation(() => {
        attempts++
        if (attempts < 3) {
          return Promise.reject(new Error('失败'))
        }
        return Promise.resolve('成功')
      })

      const result = await handler.withRetry(fn, { retries: 3, delay: 10 })

      expect(result).toBe('成功')
      expect(fn).toHaveBeenCalledTimes(3)
    })

    it('应该在重试次数用尽后抛出错误', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('持续失败'))

      await expect(
        handler.withRetry(fn, { retries: 2, delay: 10 })
      ).rejects.toThrow('持续失败')

      expect(fn).toHaveBeenCalledTimes(3) // 初始 + 2次重试
    })
  })

  describe('withTimeout', () => {
    it('应该在超时前完成时返回结果', async () => {
      const promise = new Promise(resolve => setTimeout(() => resolve('成功'), 50))
      const result = await handler.withTimeout(promise, 100)

      expect(result).toBe('成功')
    })

    it('应该在超时时抛出错误', async () => {
      const promise = new Promise(resolve => setTimeout(() => resolve('成功'), 200))

      await expect(
        handler.withTimeout(promise, 100, '操作超时')
      ).rejects.toThrow('操作超时')
    })
  })

  describe('safeExecute', () => {
    it('应该成功执行函数', async () => {
      const fn = vi.fn().mockResolvedValue('结果')
      const result = await handler.safeExecute(fn)

      expect(result).toBe('结果')
    })

    it('应该在失败时返回undefined', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('失败'))
      const result = await handler.safeExecute(fn, { showError: false })

      expect(result).toBeUndefined()
      expect(handler.errorHistory.value.length).toBe(1)
    })
  })

  describe('batchExecute', () => {
    it('应该批量执行所有项目', async () => {
      const items = [1, 2, 3]
      const fn = vi.fn().mockImplementation((item) => Promise.resolve(item * 2))

      const { results, errors } = await handler.batchExecute(items, fn)

      expect(results).toEqual([2, 4, 6])
      expect(errors).toHaveLength(0)
    })

    it('应该在 continueOnError 为 false 时停止', async () => {
      const items = [1, 2, 3]
      const fn = vi.fn().mockImplementation((item) => {
        if (item === 2) throw new Error('失败')
        return Promise.resolve(item)
      })

      await expect(
        handler.batchExecute(items, fn, { continueOnError: false })
      ).rejects.toThrow('失败')
    })

    it('应该在 continueOnError 为 true 时继续', async () => {
      const items = [1, 2, 3]
      const fn = vi.fn().mockImplementation((item) => {
        if (item === 2) throw new Error('失败')
        return Promise.resolve(item)
      })

      const { results, errors } = await handler.batchExecute(items, fn, { continueOnError: true })

      expect(results).toEqual([1, undefined, 3])
      expect(errors).toHaveLength(1)
      expect(errors[0].index).toBe(1)
    })
  })
})
