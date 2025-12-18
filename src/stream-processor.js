/**
 * 流式处理器
 * 处理大模型的流式响应，解析并执行工具调用
 */

import { ToolCallHandler } from './tool-handler.js';

export class StreamProcessor {
  constructor(domManager, options = {}) {
    this.domManager = domManager;
    this.toolHandler = new ToolCallHandler(domManager);
    this.options = {
      batchSize: options.batchSize || 1, // 批量处理大小
      debounceMs: options.debounceMs || 0, // 防抖延迟（毫秒）
      onToolCall: options.onToolCall, // 工具调用回调
      onError: options.onError, // 错误回调
      ...options,
    };
    
    this.pendingToolCalls = [];
    this.debounceTimer = null;
  }

  /**
   * 处理流式响应块
   * @param {object} chunk - 流式响应块
   */
  async processChunk(chunk) {
    const toolCalls = this.toolHandler.parseToolCallsFromChunk(chunk);
    
    if (toolCalls.length === 0) {
      return;
    }

    // 添加到待处理队列
    this.pendingToolCalls.push(...toolCalls);

    // 如果设置了防抖，延迟执行
    if (this.options.debounceMs > 0) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        this.flushPendingToolCalls();
      }, this.options.debounceMs);
    } else {
      // 立即执行
      await this.flushPendingToolCalls();
    }
  }

  /**
   * 执行待处理的工具调用
   */
  async flushPendingToolCalls() {
    if (this.pendingToolCalls.length === 0) {
      return;
    }

    // 按批量大小处理
    const batchSize = this.options.batchSize;
    const batches = [];
    
    for (let i = 0; i < this.pendingToolCalls.length; i += batchSize) {
      batches.push(this.pendingToolCalls.slice(i, i + batchSize));
    }

    // 清空待处理队列
    this.pendingToolCalls = [];

    // 执行每个批次
    for (const batch of batches) {
      try {
        const results = this.toolHandler.executeToolCalls(batch);
        
        // 触发回调
        if (this.options.onToolCall) {
          for (const result of results) {
            this.options.onToolCall(result);
          }
        }
      } catch (error) {
        console.error('Error processing tool calls:', error);
        if (this.options.onError) {
          this.options.onError(error, batch);
        }
      }
    }
  }

  /**
   * 处理完整的流式响应
   * @param {AsyncIterable|ReadableStream} stream - 流式响应
   */
  async processStream(stream) {
    try {
      // 处理异步迭代器
      if (stream[Symbol.asyncIterator]) {
        for await (const chunk of stream) {
          await this.processChunk(chunk);
        }
      }
      // 处理 ReadableStream
      else if (stream.getReader) {
        const reader = stream.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            await this.processChunk(value);
          }
        } finally {
          reader.releaseLock();
        }
      }
      // 处理数组
      else if (Array.isArray(stream)) {
        for (const chunk of stream) {
          await this.processChunk(chunk);
        }
      }
      else {
        throw new Error('Unsupported stream type');
      }

      // 处理剩余的工具调用
      await this.flushPendingToolCalls();
    } catch (error) {
      console.error('Error processing stream:', error);
      if (this.options.onError) {
        this.options.onError(error);
      }
      throw error;
    }
  }

  /**
   * 重置处理器状态
   */
  reset() {
    this.pendingToolCalls = [];
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }
}

