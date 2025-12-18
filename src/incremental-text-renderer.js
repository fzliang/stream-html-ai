/**
 * 增量文本渲染器
 * 从模型输出的文本流中解析代码块，提取指令并立即执行渲染
 */

import { createRenderer } from './renderer.js';
import { IncrementalTextParser } from './incremental-text-parser.js';

export class IncrementalTextRenderer {
  constructor(rootElement, options = {}) {
    this.renderer = createRenderer(rootElement, {
      onToolCall: options.onToolCall,
      onError: options.onError,
    });
    this.parser = new IncrementalTextParser();
    this.options = options;
    
    // 用于累积 assistant 消息
    this.assistantMessage = { role: 'assistant', content: '' };
    // 用于记录已执行的指令
    this.executedCommands = [];
  }

  /**
   * 处理文本块，增量解析并执行指令
   * @param {string} textChunk - 文本块
   * @returns {Array} 已执行的指令数组
   */
  processTextChunk(textChunk) {
    const executedCommands = [];
    
    // 累积文本内容
    this.assistantMessage.content += textChunk;
    
    // 解析文本块，提取指令
    const parsedCommands = this.parser.parseTextChunk(textChunk);
    
    // 立即执行每个已解析的指令
    for (const command of parsedCommands) {
      try {
        // 转换指令格式为工具调用格式
        const toolCall = {
          id: `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: command.name,
          arguments: typeof command.arguments === 'string' 
            ? command.arguments 
            : JSON.stringify(command.arguments),
        };
        
        // 执行工具调用
        const result = this.renderer.executeToolCall(toolCall);
        
        // 记录已执行的指令
        this.executedCommands.push({
          success: true,
          result,
          toolCall,
          command,
        });
        
        // 触发回调
        if (this.options.onToolCall) {
          this.options.onToolCall({
            success: true,
            result,
            toolCall,
            command,
          });
        }
        
        // 触发命令回调
        if (this.options.onCommand) {
          this.options.onCommand(toolCall);
        }
      } catch (error) {
        console.error(`Error executing command ${command.name}:`, error);
        
        executedCommands.push({
          success: false,
          error: error.message,
          command,
        });
        
        // 触发错误回调
        if (this.options.onError) {
          this.options.onError(error, command);
        }
      }
    }
    
    return executedCommands;
  }

  /**
   * 处理流结束，执行剩余的命令
   * @returns {Array} 已执行的指令数组
   */
  flush() {
    const executedCommands = [];
    
    // 获取剩余的命令
    const remainingCommands = this.parser.flush();
    
    // 执行剩余的命令
    for (const command of remainingCommands) {
      try {
        // 转换指令格式为工具调用格式
        const toolCall = {
          id: `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: command.name,
          arguments: typeof command.arguments === 'string' 
            ? command.arguments 
            : JSON.stringify(command.arguments),
        };
        
        const result = this.renderer.executeToolCall(toolCall);
        
        executedCommands.push({
          success: true,
          result,
          toolCall,
          command,
        });
        
        // 触发回调
        if (this.options.onToolCall) {
          this.options.onToolCall({
            success: true,
            result,
            toolCall,
            command,
          });
        }
        
        // 触发命令回调
        if (this.options.onCommand) {
          this.options.onCommand(toolCall);
        }
      } catch (error) {
        console.error(`Error executing command ${command.name}:`, error);
        
        executedCommands.push({
          success: false,
          error: error.message,
          command,
        });
        
        // 触发错误回调
        if (this.options.onError) {
          this.options.onError(error, command);
        }
      }
    }
    
    return executedCommands;
  }

  /**
   * 获取当前 assistant 消息
   * @returns {object} assistant 消息对象
   */
  getAssistantMessage() {
    return {
      role: 'assistant',
      content: this.assistantMessage.content,
    };
  }

  /**
   * 重置渲染器状态
   */
  reset() {
    this.parser.reset();
    this.assistantMessage = { role: 'assistant', content: '' };
    this.executedCommands = [];
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
 * 创建增量文本渲染器实例
 * @param {HTMLElement|string} rootElement - 根元素或选择器
 * @param {object} options - 配置选项
 * @returns {IncrementalTextRenderer}
 */
export function createIncrementalTextRenderer(rootElement, options = {}) {
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

  return new IncrementalTextRenderer(element, options);
}
