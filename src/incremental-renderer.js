/**
 * 增量渲染器
 * 支持增量解析和执行工具调用，一旦检测到完整的工具调用就立即执行并渲染
 */

import { createRenderer } from './renderer.js';
import { IncrementalCommandParser } from './incremental-command-parser.js';

export class IncrementalRenderer {
  constructor(rootElement, options = {}) {
    this.renderer = createRenderer(rootElement, {
      onToolCall: options.onToolCall,
      onError: options.onError,
    });
    this.parser = new IncrementalCommandParser();
    this.options = options;
    
    // 用于累积 assistant 消息
    this.assistantMessage = { role: 'assistant', content: '', tool_calls: [] };
    // 用于记录已执行的工具调用 ID（用于构建 tool_calls 数组）
    this.executedToolCalls = [];
  }

  /**
   * 处理流式响应块，增量解析并执行工具调用
   * @param {object} chunk - 流式响应块
   * @returns {Array} 已执行的工具调用数组
   */
  processChunk(chunk) {
    const executedToolCalls = [];
    
    // 解析已完成的工具调用
    const completedToolCalls = this.parser.parseChunk(chunk);
    
    // 立即执行每个已完成的工具调用
    for (const toolCall of completedToolCalls) {
      try {
        // 执行工具调用
        const result = this.renderer.executeToolCall(toolCall);
        
        // 记录已执行的工具调用
        this.executedToolCalls.push({
          id: toolCall.id,
          type: 'function',
          function: {
            name: toolCall.name,
            arguments: toolCall.arguments,
          },
        });
        
        executedToolCalls.push({
          success: true,
          result,
          toolCall,
        });
        
        // 触发回调
        if (this.options.onToolCall) {
          this.options.onToolCall({
            success: true,
            result,
            toolCall,
          });
        }
        
        // 触发命令回调
        if (this.options.onCommand) {
          this.options.onCommand(toolCall);
        }
      } catch (error) {
        console.error(`Error executing tool ${toolCall.name}:`, error);
        
        executedToolCalls.push({
          success: false,
          error: error.message,
          toolCall,
        });
        
        // 触发错误回调
        if (this.options.onError) {
          this.options.onError(error, toolCall);
        }
      }
    }
    
    // 累积 assistant 消息内容
    if (chunk.choices && Array.isArray(chunk.choices)) {
      for (const choice of chunk.choices) {
        if (choice.delta?.content) {
          this.assistantMessage.content += choice.delta.content;
        }
      }
    }
    
    return executedToolCalls;
  }

  /**
   * 处理流结束，执行剩余的工具调用
   * @returns {Array} 已执行的工具调用数组
   */
  flush() {
    const executedToolCalls = [];
    
    // 获取剩余的工具调用
    const remainingToolCalls = this.parser.flush();
    
    // 执行剩余的工具调用
    for (const toolCall of remainingToolCalls) {
      try {
        const result = this.renderer.executeToolCall(toolCall);
        
        // 记录已执行的工具调用
        this.executedToolCalls.push({
          id: toolCall.id,
          type: 'function',
          function: {
            name: toolCall.name,
            arguments: toolCall.arguments,
          },
        });
        
        executedToolCalls.push({
          success: true,
          result,
          toolCall,
        });
        
        // 触发回调
        if (this.options.onToolCall) {
          this.options.onToolCall({
            success: true,
            result,
            toolCall,
          });
        }
        
        // 触发命令回调
        if (this.options.onCommand) {
          this.options.onCommand(toolCall);
        }
      } catch (error) {
        console.error(`Error executing tool ${toolCall.name}:`, error);
        
        executedToolCalls.push({
          success: false,
          error: error.message,
          toolCall,
        });
        
        // 触发错误回调
        if (this.options.onError) {
          this.options.onError(error, toolCall);
        }
      }
    }
    
    return executedToolCalls;
  }

  /**
   * 获取当前 assistant 消息（包含已执行的工具调用）
   * @returns {object} assistant 消息对象
   */
  getAssistantMessage() {
    return {
      role: 'assistant',
      content: this.assistantMessage.content,
      tool_calls: this.executedToolCalls.length > 0 ? this.executedToolCalls : undefined,
    };
  }

  /**
   * 获取工具调用结果（用于回调给模型）
   * @returns {Array} 工具调用结果数组
   */
  getToolResults() {
    return this.executedToolCalls.map(toolCall => ({
      tool_call_id: toolCall.id,
      role: 'tool',
      name: toolCall.function.name,
      content: JSON.stringify({ success: true }),
    }));
  }

  /**
   * 重置渲染器状态
   */
  reset() {
    this.parser.reset();
    this.assistantMessage = { role: 'assistant', content: '', tool_calls: [] };
    this.executedToolCalls = [];
  }

  /**
   * 清空所有渲染内容
   */
  clear() {
    this.renderer.clear();
    this.reset();
  }

  /**
   * 获取底层渲染器
   */
  getRenderer() {
    return this.renderer;
  }
}

/**
 * 创建增量渲染器实例
 * @param {HTMLElement|string} rootElement - 根元素或选择器
 * @param {object} options - 配置选项
 * @returns {IncrementalRenderer}
 */
export function createIncrementalRenderer(rootElement, options = {}) {
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

  return new IncrementalRenderer(element, options);
}
