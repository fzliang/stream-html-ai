/**
 * 工具调用处理器
 * 负责解析和执行大模型返回的工具调用
 */

import { tools } from './tools.js';

export class ToolCallHandler {
  constructor(domManager) {
    this.domManager = domManager;
    this.toolContext = { domManager };
    
    // 绑定工具函数到上下文
    this.boundTools = {};
    for (const [name, fn] of Object.entries(tools)) {
      this.boundTools[name] = fn.bind(this.toolContext);
    }
  }

  /**
   * 执行单个工具调用
   * @param {object} toolCall - 工具调用对象
   * @param {string} toolCall.name - 工具名称
   * @param {object} toolCall.arguments - 工具参数（JSON 字符串或对象）
   * @returns {*} 工具执行结果
   */
  executeToolCall(toolCall) {
    const { name, arguments: args } = toolCall;

    if (!name || !this.boundTools[name]) {
      throw new Error(`Unknown tool: ${name}`);
    }

    // 解析参数（可能是 JSON 字符串或对象）
    let parsedArgs;
    if (typeof args === 'string') {
      try {
        parsedArgs = JSON.parse(args);
      } catch (e) {
        throw new Error(`Invalid JSON arguments: ${args}`);
      }
    } else {
      parsedArgs = args || {};
    }

    // 执行工具函数
    try {
      const toolFn = this.boundTools[name];
      
      // 根据工具名称调用不同的参数格式
      if (name === 'h') {
        return toolFn(parsedArgs.parentId, parsedArgs.tagName, parsedArgs.props || {});
      } else if (name === 'updateElement') {
        return toolFn(parsedArgs.elementId, parsedArgs.props || {});
      } else if (name === 'setText' || name === 'appendText') {
        return toolFn(parsedArgs.elementId, parsedArgs.text || '');
      } else if (name === 'removeElement') {
        return toolFn(parsedArgs.elementId);
      } else {
        // 通用调用（如果参数是数组）
        return toolFn(...(Array.isArray(parsedArgs) ? parsedArgs : [parsedArgs]));
      }
    } catch (error) {
      console.error(`Error executing tool ${name}:`, error);
      throw error;
    }
  }

  /**
   * 批量执行工具调用
   * @param {Array} toolCalls - 工具调用数组
   * @returns {Array} 执行结果数组
   */
  executeToolCalls(toolCalls) {
    const results = [];
    for (const toolCall of toolCalls) {
      try {
        const result = this.executeToolCall(toolCall);
        results.push({ success: true, result, toolCall });
      } catch (error) {
        results.push({ success: false, error: error.message, toolCall });
      }
    }
    return results;
  }

  /**
   * 从流式响应中解析工具调用
   * 支持 OpenAI 格式和通用格式
   * @param {object} chunk - 流式响应块
   * @returns {Array} 工具调用数组
   */
  parseToolCallsFromChunk(chunk) {
    const toolCalls = [];

    // OpenAI 格式
    if (chunk.choices && Array.isArray(chunk.choices)) {
      for (const choice of chunk.choices) {
        if (choice.delta?.tool_calls) {
          for (const toolCall of choice.delta.tool_calls) {
            toolCalls.push({
              id: toolCall.id,
              name: toolCall.function?.name,
              arguments: toolCall.function?.arguments,
              index: toolCall.index,
            });
          }
        }
      }
    }

    // 通用格式：直接包含 tool_calls
    if (chunk.tool_calls && Array.isArray(chunk.tool_calls)) {
      toolCalls.push(...chunk.tool_calls);
    }

    // 单个工具调用对象
    if (chunk.name && chunk.arguments) {
      toolCalls.push(chunk);
    }

    return toolCalls;
  }
}

