/**
 * 增量指令解析器
 * 从流式输出中增量解析工具调用，一旦检测到完整的工具调用就立即返回
 */

export class IncrementalCommandParser {
  constructor() {
    // 用于累积工具调用的缓冲区（key: tool_call_id 或 index, value: { id, name, arguments, index }）
    this.toolCallBuffer = new Map();
    // 已完成的工具调用（已执行过的，避免重复执行）
    this.completedToolCalls = new Set();
  }

  /**
   * 处理流式响应块，返回已完成的工具调用
   * @param {object} chunk - 流式响应块
   * @returns {Array} 已完成的工具调用数组
   */
  parseChunk(chunk) {
    const completedToolCalls = [];

    // OpenAI/DeepSeek 格式
    if (chunk.choices && Array.isArray(chunk.choices)) {
      for (const choice of chunk.choices) {
        // 处理工具调用的增量数据
        if (choice.delta?.tool_calls) {
          for (const deltaToolCall of choice.delta.tool_calls) {
            const toolCallIndex = deltaToolCall.index;
            const toolCallKey = `index_${toolCallIndex}`;
            
            // 如果这个工具调用已经完成，跳过
            if (this.completedToolCalls.has(toolCallKey)) {
              continue;
            }
            
            // 获取或创建工具调用对象
            if (!this.toolCallBuffer.has(toolCallKey)) {
              this.toolCallBuffer.set(toolCallKey, {
                id: deltaToolCall.id || undefined,
                name: '',
                arguments: '',
                index: toolCallIndex,
              });
            }
            
            const toolCall = this.toolCallBuffer.get(toolCallKey);
            
            // 更新 id（如果之前没有）
            if (deltaToolCall.id && !toolCall.id) {
              toolCall.id = deltaToolCall.id;
            }
            
            // 更新 name
            if (deltaToolCall.function?.name) {
              toolCall.name = deltaToolCall.function.name;
            }
            
            // 累积 arguments
            if (deltaToolCall.function?.arguments) {
              toolCall.arguments += deltaToolCall.function.arguments;
            }
            
            // 检查工具调用是否完整（有 name 和完整的 arguments）
            if (toolCall.name && toolCall.arguments && toolCall.arguments.trim()) {
              // 尝试解析 arguments 验证是否完整
              try {
                const parsedArgs = JSON.parse(toolCall.arguments);
                // 解析成功，说明参数完整
                const completedToolCall = {
                  id: toolCall.id || `temp_${toolCallIndex}`,
                  name: toolCall.name,
                  arguments: toolCall.arguments,
                  index: toolCall.index,
                };
                
                // 标记为已完成
                this.completedToolCalls.add(toolCallKey);
                this.toolCallBuffer.delete(toolCallKey);
                
                completedToolCalls.push(completedToolCall);
              } catch (e) {
                // JSON 解析失败，说明参数还不完整，继续等待
                // 不执行任何操作
              }
            }
          }
        }
        
        // 处理最后一个 chunk 中的完整工具调用（finish_reason: tool_calls）
        if (choice.finish_reason === 'tool_calls' && choice.message?.tool_calls) {
          for (const toolCall of choice.message.tool_calls) {
            const toolCallKey = `index_${toolCall.index}`;
            
            // 如果已经完成，跳过
            if (this.completedToolCalls.has(toolCallKey)) {
              continue;
            }
            
            // 检查是否有完整的工具调用
            if (toolCall.function?.name && toolCall.function?.arguments) {
              try {
                // 验证参数是否完整
                JSON.parse(toolCall.function.arguments);
                
                const completedToolCall = {
                  id: toolCall.id,
                  name: toolCall.function.name,
                  arguments: toolCall.function.arguments,
                  index: toolCall.index,
                };
                
                // 标记为已完成
                this.completedToolCalls.add(toolCallKey);
                this.toolCallBuffer.delete(toolCallKey);
                
                completedToolCalls.push(completedToolCall);
              } catch (e) {
                // 参数不完整，尝试从缓冲区获取
                if (this.toolCallBuffer.has(toolCallKey)) {
                  const bufferedToolCall = this.toolCallBuffer.get(toolCallKey);
                  if (bufferedToolCall.name && bufferedToolCall.arguments) {
                    try {
                      JSON.parse(bufferedToolCall.arguments);
                      
                      const completedToolCall = {
                        id: bufferedToolCall.id || toolCall.id || `temp_${toolCall.index}`,
                        name: bufferedToolCall.name,
                        arguments: bufferedToolCall.arguments,
                        index: bufferedToolCall.index,
                      };
                      
                      this.completedToolCalls.add(toolCallKey);
                      this.toolCallBuffer.delete(toolCallKey);
                      
                      completedToolCalls.push(completedToolCall);
                    } catch (e2) {
                      // 仍然不完整，忽略
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    
    // 通用格式：直接包含 tool_calls
    if (chunk.tool_calls && Array.isArray(chunk.tool_calls)) {
      for (const toolCall of chunk.tool_calls) {
        if (toolCall.name && toolCall.arguments) {
          try {
            // 验证参数是否完整
            const parsedArgs = typeof toolCall.arguments === 'string' 
              ? JSON.parse(toolCall.arguments)
              : toolCall.arguments;
            
            completedToolCalls.push({
              id: toolCall.id || `temp_${Date.now()}`,
              name: toolCall.name,
              arguments: typeof toolCall.arguments === 'string' 
                ? toolCall.arguments 
                : JSON.stringify(toolCall.arguments),
              index: toolCall.index || 0,
            });
          } catch (e) {
            // 参数不完整，忽略
          }
        }
      }
    }
    
    // 单个工具调用对象
    if (chunk.name && chunk.arguments) {
      try {
        const parsedArgs = typeof chunk.arguments === 'string'
          ? JSON.parse(chunk.arguments)
          : chunk.arguments;
        
        completedToolCalls.push({
          id: chunk.id || `temp_${Date.now()}`,
          name: chunk.name,
          arguments: typeof chunk.arguments === 'string'
            ? chunk.arguments
            : JSON.stringify(chunk.arguments),
          index: chunk.index || 0,
        });
      } catch (e) {
        // 参数不完整，忽略
      }
    }
    
    return completedToolCalls;
  }

  /**
   * 处理流结束，返回所有剩余的工具调用
   * @returns {Array} 剩余的工具调用数组
   */
  flush() {
    const remainingToolCalls = [];
    
    for (const [toolCallKey, toolCall] of this.toolCallBuffer.entries()) {
      if (this.completedToolCalls.has(toolCallKey)) {
        continue;
      }
      
      if (toolCall.name && toolCall.arguments && toolCall.arguments.trim()) {
        try {
          // 验证参数是否完整
          JSON.parse(toolCall.arguments);
          
          remainingToolCalls.push({
            id: toolCall.id || `temp_${toolCall.index}`,
            name: toolCall.name,
            arguments: toolCall.arguments,
            index: toolCall.index,
          });
          
          this.completedToolCalls.add(toolCallKey);
        } catch (e) {
          // 参数不完整，忽略
        }
      }
    }
    
    this.toolCallBuffer.clear();
    return remainingToolCalls;
  }

  /**
   * 重置解析器状态
   */
  reset() {
    this.toolCallBuffer.clear();
    this.completedToolCalls.clear();
  }
}
