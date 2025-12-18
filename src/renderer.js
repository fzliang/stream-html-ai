/**
 * 渲染引擎
 * 整合所有组件，提供简单的 API
 */

import { DOMManager } from './dom-manager.js';
import { StreamProcessor } from './stream-processor.js';
import { getToolSchemas } from './tools.js';

export class Renderer {
  constructor(rootElement, options = {}) {
    this.domManager = new DOMManager(rootElement);
    this.streamProcessor = new StreamProcessor(this.domManager, {
      onToolCall: options.onToolCall,
      onError: options.onError,
      batchSize: options.batchSize,
      debounceMs: options.debounceMs,
    });
    this.options = options;
  }

  /**
   * 处理流式响应
   * @param {AsyncIterable|ReadableStream|Array} stream - 流式响应
   */
  async renderStream(stream) {
    return await this.streamProcessor.processStream(stream);
  }

  /**
   * 执行单个工具调用
   * @param {object} toolCall - 工具调用对象
   */
  executeToolCall(toolCall) {
    return this.streamProcessor.toolHandler.executeToolCall(toolCall);
  }

  /**
   * 批量执行工具调用
   * @param {Array} toolCalls - 工具调用数组
   */
  executeToolCalls(toolCalls) {
    return this.streamProcessor.toolHandler.executeToolCalls(toolCalls);
  }

  /**
   * 清空所有渲染内容
   */
  clear() {
    this.domManager.clear();
  }

  /**
   * 获取工具 Schema（用于大模型工具定义）
   */
  getToolSchemas() {
    return getToolSchemas();
  }

  /**
   * 获取 DOM 树结构（用于调试）
   */
  getTree() {
    return this.domManager.getTree();
  }
}

/**
 * 创建渲染器实例
 * @param {HTMLElement|string} rootElement - 根元素或选择器
 * @param {object} options - 配置选项
 * @returns {Renderer}
 */
export function createRenderer(rootElement, options = {}) {
  let element;
  
  if (typeof rootElement === 'string') {
    element = document.querySelector(rootElement);
    if (!element) {
      throw new Error(`Root element not found: ${rootElement}`);
    }
  } else if (rootElement instanceof HTMLElement) {
    element = rootElement;
  } else {
    element = document.body;
  }

  return new Renderer(element, options);
}

