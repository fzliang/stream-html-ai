/**
 * OpenAI API 集成示例
 * 展示如何将流式 HTML 渲染与大模型 API 结合使用
 */

import { createRenderer } from '../src/renderer.js';
import { systemPrompt } from '../src/prompt.js';
import { getToolSchemas } from '../src/tools.js';
import { MODEL_CONFIG } from '../modelConfig.js';

/**
 * 配置 OpenAI API 调用
 * @param {Array} messages - 消息数组
 */
async function callOpenAIWithTools(messages) {
  const model = MODEL_CONFIG.model;
  const apiKey = MODEL_CONFIG.apiKey;
  // 清理和验证消息格式
  const cleanedMessages = messages.map(msg => {
    const cleaned = { role: msg.role };
    
    // 根据角色设置相应的字段
    if (msg.role === 'system' || msg.role === 'user') {
      cleaned.content = msg.content || '';
    } else if (msg.role === 'assistant') {
      if (msg.content) {
        cleaned.content = msg.content;
      }
      if (msg.tool_calls && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
        cleaned.tool_calls = msg.tool_calls;
      }
    } else if (msg.role === 'tool') {
      cleaned.tool_call_id = msg.tool_call_id || msg.id;
      cleaned.name = msg.name;
      cleaned.content = msg.content || '';
    }
    
    return cleaned;
  });
  
  const requestBody = {
    model: 'deepseek-chat',
    messages: cleanedMessages,
    tools: getToolSchemas().map(schema => ({
      type: 'function',
      function: schema,
    })),
    tool_choice: 'auto',
    stream: true,
  };
  
  console.log('API Request messages:', cleanedMessages.length, 'messages');
  console.log('API Request body:', JSON.stringify(requestBody, null, 2));
  
  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    // 尝试获取详细的错误信息
    let errorMessage = `API error: ${response.status} ${response.statusText}`;
    try {
      const errorData = await response.json();
      if (errorData.error) {
        errorMessage += ` - ${errorData.error.message || JSON.stringify(errorData.error)}`;
      } else {
        errorMessage += ` - ${JSON.stringify(errorData)}`;
      }
    } catch (e) {
      // 如果无法解析 JSON，使用默认错误信息
      const text = await response.text();
      if (text) {
        errorMessage += ` - ${text.substring(0, 200)}`;
      }
    }
    throw new Error(errorMessage);
  }

  return response.body;
}

/**
 * 处理流式响应并渲染（ReAct 模式）
 * @param {string} prompt - 用户提示词
 * @param {HTMLElement} rootElement - 根元素
 * @param {object} options - 选项
 * @param {function} options.onLog - 日志回调函数 (message, type, data)
 * @param {Array} options.messages - 已有的消息历史（用于继续对话）
 * @param {AbortSignal} options.signal - 中断信号（用于停止）
 * @param {Renderer} options.renderer - 已有的渲染器（用于继续对话）
 */
async function renderWithAI(prompt, rootElement, options = {}) {
  const { onLog, messages: existingMessages, signal, renderer: existingRenderer, onCommand } = options;
  
  // 日志辅助函数
  const log = (message, type = 'info', data = null) => {
    if (onLog) {
      onLog(message, type, data);
    }
    console.log(`[${type}]`, message, data || '');
  };

  // 使用已有的渲染器或创建新的
  const renderer = existingRenderer || createRenderer(rootElement, {
    onToolCall: (result) => {
      if (result.success) {
        log(`✓ 工具执行成功: ${result.toolCall.name}`, 'success', result.toolCall);
        console.log('✓ Tool executed:', result.toolCall.name);
      } else {
        log(`✗ 工具执行失败: ${result.error}`, 'error', result.toolCall);
        console.error('✗ Tool failed:', result.error);
      }
    },
    onError: (error) => {
      log(`❌ 渲染器错误: ${error.message}`, 'error', error);
      console.error('Renderer error:', error);
    },
  });

  // 初始化消息数组（如果已有消息历史，则使用它；否则创建新的）
  let messages;
  if (existingMessages && Array.isArray(existingMessages)) {
    // 深拷贝消息数组，避免修改原始数组
    messages = JSON.parse(JSON.stringify(existingMessages));
  } else {
    messages = [
      {
        role: 'system',
        content: systemPrompt,
      },
    ];
  }
  
  // 添加用户的新消息
  messages.push({
    role: 'user',
    content: prompt,
  });
  
  // 验证消息格式
  log(`📋 消息历史: ${messages.length} 条消息`, 'info', {
    messageCount: messages.length,
    roles: messages.map(m => m.role)
  });
  
  // 验证消息格式
  log(`📋 消息历史: ${messages.length} 条消息`, 'info', {
    messageCount: messages.length,
    roles: messages.map(m => m.role)
  });

  try {
    log('🚀 开始调用 AI API...', 'info');
    log(`📝 用户提示: ${prompt}`, 'info');
    
    // ReAct 循环：持续处理工具调用，直到模型不再调用工具
    let maxIterations = 1000; // 防止无限循环，最多 50 轮
    let iteration = 0;
    let emptyToolCallsCount = 0; // 记录连续没有工具调用的次数
    
    while (iteration < maxIterations) {
      iteration++;
      log(`\n🔄 ReAct 循环 #${iteration}`, 'info');
      
      // 检查是否被中断
      if (signal && signal.aborted) {
        log('⏹️ 用户中断了请求', 'warning');
        throw new Error('Request aborted by user');
      }
      
      // 调用 API
      const stream = await callOpenAIWithTools(messages);
    
      // 处理流式响应
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      
      // 用于累积工具调用的参数（key: tool_call_id, value: { id, name, arguments, index }）
      const toolCallBuffer = new Map();
      let assistantMessage = { role: 'assistant', content: '', tool_calls: [] };
      let finishReason = null;
      let hasToolCalls = false;

      while (true) {
        // 检查是否被中断
        if (signal && signal.aborted) {
          reader.cancel();
          log('⏹️ 用户中断了请求', 'warning');
          throw new Error('Request aborted by user');
        }
        
        const { done, value } = await reader.read();
        if (done) {
          log('📥 流式响应结束，处理剩余的工具调用...', 'info');
          // 流结束，处理剩余的工具调用
          const finalToolCalls = [];
          for (const [toolCallKey, toolCall] of toolCallBuffer.entries()) {
            if (toolCall.name && toolCall.arguments) {
              try {
                // 验证参数是否完整
                const parsedArgs = JSON.parse(toolCall.arguments);
                finalToolCalls.push({
                  id: toolCall.id,
                  name: toolCall.name,
                  arguments: toolCall.arguments,
                  index: toolCall.index,
                });
                log(`  ✓ 最终工具调用: ${toolCall.name}`, 'success', { arguments: parsedArgs });
              } catch (e) {
                log(`  ⚠️ 工具调用参数不完整，跳过: ${toolCall.name}`, 'warning', {
                  error: e.message,
                  arguments: toolCall.arguments
                });
              }
            }
          }
          
          // 如果有工具调用，执行并准备回调
          if (finalToolCalls.length > 0) {
            log(`✅ 执行 ${finalToolCalls.length} 个最终工具调用`, 'info', finalToolCalls);
            try {
              // 输出渲染指令
              if (onCommand) {
                for (const toolCall of finalToolCalls) {
                  onCommand(toolCall);
                }
              }
              
              // 执行工具调用
              const results = renderer.executeToolCalls(finalToolCalls);
              
              // 构建工具调用结果，准备回调给模型
              const toolResults = finalToolCalls.map((toolCall, idx) => ({
                tool_call_id: toolCall.id,
                role: 'tool',
                name: toolCall.name,
                content: JSON.stringify(results[idx]?.result || results[idx] || { success: true }),
              }));
              
              // 更新 assistant 消息
              assistantMessage.tool_calls = finalToolCalls.map(tc => ({
                id: tc.id,
                type: 'function',
                function: {
                  name: tc.name,
                  arguments: tc.arguments,
                },
              }));
              
              // 添加到消息历史
              messages.push(assistantMessage);
              messages.push(...toolResults);
              
              log('📤 工具执行结果已回调给模型，继续下一轮...', 'info', {
                toolResults: toolResults.length,
                nextIteration: iteration + 1
              });
              
              hasToolCalls = true;
            } catch (e) {
              log(`❌ 执行最终工具调用失败: ${e.message}`, 'error', e);
              // 即使失败，也要告诉模型
              const errorResults = finalToolCalls.map(toolCall => ({
                tool_call_id: toolCall.id,
                role: 'tool',
                name: toolCall.name,
                content: JSON.stringify({ error: e.message }),
              }));
              assistantMessage.tool_calls = finalToolCalls.map(tc => ({
                id: tc.id,
                type: 'function',
                function: {
                  name: tc.name,
                  arguments: tc.arguments,
                },
              }));
              messages.push(assistantMessage);
              messages.push(...errorResults);
              hasToolCalls = true;
            }
          } else {
            log('ℹ️ 没有剩余的工具调用需要处理', 'info');
          }
          toolCallBuffer.clear();
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // 保留最后一个不完整的行

        for (const line of lines) {
          if (line.trim() === '') continue;
          
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') {
              // 流式响应结束标记，但可能还有最后一个 chunk 需要处理
              continue;
            }

            try {
              const chunk = JSON.parse(data);
              
              // 检查是否是最后一个 chunk（包含完整的 finish_reason）
              if (chunk.choices && Array.isArray(chunk.choices)) {
                for (const choice of chunk.choices) {
                  // 如果这个 chunk 有 finish_reason，说明是最后一个 chunk
                  if (choice.finish_reason) {
                    finishReason = choice.finish_reason;
                    // 如果 finish_reason 是 tool_calls，可能还有完整的 tool_calls 信息
                    if (choice.finish_reason === 'tool_calls' && choice.message?.tool_calls) {
                      // 处理完整的 tool_calls（在最后一个 chunk 中）
                      for (const toolCall of choice.message.tool_calls) {
                        const toolCallKey = `index_${toolCall.index}`;
                        if (!toolCallBuffer.has(toolCallKey)) {
                          toolCallBuffer.set(toolCallKey, {
                            id: toolCall.id,
                            name: toolCall.function?.name || '',
                            arguments: toolCall.function?.arguments || '',
                            index: toolCall.index,
                          });
                        } else {
                          // 更新已有的工具调用
                          const existing = toolCallBuffer.get(toolCallKey);
                          if (toolCall.function?.arguments) {
                            existing.arguments = toolCall.function.arguments;
                          }
                          if (toolCall.function?.name) {
                            existing.name = toolCall.function.name;
                          }
                          if (toolCall.id) {
                            existing.id = toolCall.id;
                          }
                        }
                      }
                    }
                  }
                }
              }
            
            // 处理工具调用的分块参数（OpenAI/DeepSeek 格式）
            if (chunk.choices && Array.isArray(chunk.choices)) {
              for (const choice of chunk.choices) {
                // 累积工具调用的分块参数
                if (choice.delta?.tool_calls) {
                  for (const deltaToolCall of choice.delta.tool_calls) {
                    // 使用 index 作为主要 key，因为它在流式传输中更稳定
                    // id 可能在后续块中才出现
                    const toolCallIndex = deltaToolCall.index;
                    const toolCallKey = `index_${toolCallIndex}`;
                    
                    if (!toolCallBuffer.has(toolCallKey)) {
                      toolCallBuffer.set(toolCallKey, {
                        id: deltaToolCall.id || undefined,
                        name: '',
                        arguments: '',
                        index: toolCallIndex,
                      });
                    }
                    
                    const toolCall = toolCallBuffer.get(toolCallKey);
                    
                    // 更新 id（如果之前没有）
                    if (deltaToolCall.id && !toolCall.id) {
                      toolCall.id = deltaToolCall.id;
                    }
                    
                    // 更新 name
                    if (deltaToolCall.function?.name) {
                      if (!toolCall.name) {
                        toolCall.name = deltaToolCall.function.name;
                        log(`📦 工具调用开始: ${toolCall.name}`, 'info', { 
                          id: toolCall.id || `index_${toolCallIndex}`,
                          index: toolCallIndex 
                        });
                      }
                    }
                    
                    // 累积 arguments
                    if (deltaToolCall.function?.arguments) {
                      toolCall.arguments += deltaToolCall.function.arguments;
                      // 不显示参数累积进度，减少日志噪音
                    }
                  }
                }
                
                // 记录 finish_reason
                if (choice.finish_reason) {
                  finishReason = choice.finish_reason;
                }
                
                // 累积 assistant 消息内容
                if (choice.delta?.content) {
                  assistantMessage.content += choice.delta.content;
                }
                
                // 检查工具调用是否完成（通过 finish_reason）
                if (choice.finish_reason === 'tool_calls') {
                  log('🎯 检测到工具调用完成信号 (finish_reason: tool_calls)', 'info');
                  // 当 finish_reason 为 'tool_calls' 时，执行所有累积的工具调用
                  const completedToolCalls = [];
                  for (const [toolCallKey, toolCall] of toolCallBuffer.entries()) {
                    // 检查工具调用是否完整（有 name 和 arguments）
                    if (toolCall.name && toolCall.arguments && toolCall.arguments.trim()) {
                      // 验证参数是否完整（尝试解析）
                      try {
                        const parsedArgs = JSON.parse(toolCall.arguments);
                        completedToolCalls.push({
                          id: toolCall.id,
                          name: toolCall.name,
                          arguments: toolCall.arguments,
                          index: toolCall.index,
                        });
                        log(`  ✓ 工具调用已完整: ${toolCall.name}`, 'success', {
                          id: toolCall.id || toolCallKey,
                          index: toolCall.index,
                          arguments: parsedArgs,
                          rawLength: toolCall.arguments.length
                        });
                      } catch (e) {
                        log(`  ⚠️ 工具调用参数解析失败: ${toolCall.name || '未知'}`, 'warning', {
                          error: e.message,
                          arguments: toolCall.arguments.substring(0, 200),
                          key: toolCallKey
                        });
                      }
                    } else {
                      // 工具调用不完整
                      log(`  ⚠️ 工具调用不完整 (key: ${toolCallKey})`, 'warning', {
                        name: toolCall.name || '(空)',
                        argumentsLength: toolCall.arguments?.length || 0,
                        hasName: !!toolCall.name,
                        hasArguments: !!(toolCall.arguments && toolCall.arguments.trim())
                      });
                    }
                  }
                  
                  // 执行所有完成的工具调用
                  if (completedToolCalls.length > 0) {
                    log(`🚀 准备执行 ${completedToolCalls.length} 个工具调用`, 'info', completedToolCalls);
                    try {
                      // 输出渲染指令
                      if (onCommand) {
                        for (const toolCall of completedToolCalls) {
                          onCommand(toolCall);
                        }
                      }
                      
                      // 执行工具调用
                      const results = renderer.executeToolCalls(completedToolCalls);
                      
                      // 构建工具调用结果，准备回调给模型
                      const toolResults = completedToolCalls.map((toolCall, idx) => ({
                        tool_call_id: toolCall.id,
                        role: 'tool',
                        name: toolCall.name,
                        content: JSON.stringify(results[idx]?.result || results[idx] || { success: true }),
                      }));
                      
                      // 更新 assistant 消息
                      assistantMessage.tool_calls = completedToolCalls.map(tc => ({
                        id: tc.id,
                        type: 'function',
                        function: {
                          name: tc.name,
                          arguments: tc.arguments,
                        },
                      }));
                      
                      // 添加到消息历史
                      messages.push(assistantMessage);
                      messages.push(...toolResults);
                      
                      log('📤 工具执行结果已回调给模型，继续下一轮...', 'info', {
                        toolResults: toolResults.length,
                        nextIteration: iteration + 1
                      });
                      
                      hasToolCalls = true;
                      // 清除已执行的工具调用
                      for (const toolCall of completedToolCalls) {
                        const key = `index_${toolCall.index}`;
                        toolCallBuffer.delete(key);
                      }
                      log(`✅ 工具调用执行完成 (${completedToolCalls.length} 个)`, 'success', results);
                    } catch (e) {
                      log(`❌ 执行工具调用失败: ${e.message}`, 'error', {
                        error: e,
                        toolCalls: completedToolCalls
                      });
                      // 即使失败，也要告诉模型
                      const errorResults = completedToolCalls.map(toolCall => ({
                        tool_call_id: toolCall.id,
                        role: 'tool',
                        name: toolCall.name,
                        content: JSON.stringify({ error: e.message }),
                      }));
                      assistantMessage.tool_calls = completedToolCalls.map(tc => ({
                        id: tc.id,
                        type: 'function',
                        function: {
                          name: tc.name,
                          arguments: tc.arguments,
                        },
                      }));
                      messages.push(assistantMessage);
                      messages.push(...errorResults);
                      hasToolCalls = true;
                    }
                  } else {
                    log('⚠️ 没有找到完整的工具调用', 'warning', {
                      buffer: Array.from(toolCallBuffer.entries())
                    });
                  }
                }
              }
              } else if (chunk.tool_calls || (chunk.name && chunk.arguments)) {
                // 直接处理完整的工具调用
                await renderer.renderStream([chunk]);
              }
            } catch (e) {
              log(`⚠️ 解析数据块失败: ${e.message}`, 'warning', { error: e, line });
              console.error('Error parsing chunk:', e, line);
            }
          }
        }
      } // while (true) 结束
      
      // 检查是否应该继续下一轮
      if (hasToolCalls) {
        // 有工具调用，继续下一轮
        log('🔄 准备进入下一轮 ReAct 循环...', 'info');
        hasToolCalls = false;
        emptyToolCallsCount = 0; // 重置计数器
        assistantMessage = { role: 'assistant', content: '', tool_calls: [] };
        finishReason = null;
        // 继续 while 循环，进入下一轮迭代
      } else {
        // 没有工具调用，检查 finish_reason
        if (finishReason) {
          if (finishReason === 'tool_calls') {
            // finish_reason 是 tool_calls 但没有工具调用，可能是流式传输的问题
            emptyToolCallsCount++;
            log(`⚠️ finish_reason 是 tool_calls 但没有工具调用 (连续 ${emptyToolCallsCount} 次)，继续等待...`, 'warning');
            
            // 如果连续 3 次遇到这种情况，认为可能是异常，结束循环
            if (emptyToolCallsCount >= 3) {
              log('❌ 连续多次 finish_reason 为 tool_calls 但没有工具调用，可能存在问题，结束循环', 'error');
              break;
            }
            // 不结束循环，继续下一轮
          } else {
            // finish_reason 不是 tool_calls，说明模型已完成
            log(`✅ 模型完成 (finish_reason: ${finishReason})`, 'success');
            if (assistantMessage.content) {
              messages.push(assistantMessage);
              log(`💬 模型回复: ${assistantMessage.content}`, 'info');
            }
            break; // 结束 ReAct 循环
          }
        } else {
          // finish_reason 为 null，重置计数器
          emptyToolCallsCount = 0;
          // finish_reason 为 null，可能是流式传输还没完成或没有正确捕获
          // 检查是否有 assistant 消息内容
          if (assistantMessage.content && assistantMessage.content.trim()) {
            // 有内容但没有工具调用，可能是模型的最终回复
            // 但为了确保模型有足够机会继续，如果内容很短，继续等待
            const contentLength = assistantMessage.content.trim().length;
            if (contentLength < 10) {
              // 内容太短，可能是中间状态，继续下一轮
              log('⚠️ 模型返回了很短的文本内容，可能是中间状态，继续下一轮...', 'warning', {
                content: assistantMessage.content,
                length: contentLength
              });
              // 不结束循环，继续下一轮
            } else {
              // 内容足够长，可能是最终回复
              log('✅ 模型返回了文本内容，没有工具调用', 'success');
              messages.push(assistantMessage);
              log(`💬 模型回复: ${assistantMessage.content}`, 'info');
              break; // 结束 ReAct 循环
            }
          } else {
            // 既没有工具调用，也没有内容，可能是异常情况
            emptyToolCallsCount++;
            // 但如果这是第一轮或第二轮，可能是模型还在思考，继续等待
            if (iteration <= 2) {
              log('⚠️ 流式响应结束，但没有工具调用和内容（可能是第一轮），继续下一轮...', 'warning');
              // 不结束循环，继续下一轮
            } else {
              // 如果连续多次没有工具调用和内容，结束循环
              if (emptyToolCallsCount >= 3) {
                log('❌ 连续多次没有工具调用和内容，结束 ReAct 循环', 'warning');
                break; // 结束 ReAct 循环
              } else {
                log('⚠️ 流式响应结束，但没有工具调用和内容，继续下一轮...', 'warning');
                // 继续下一轮
              }
            }
          }
        }
      }
    } // while (iteration < maxIterations) 结束
    
    // 检查是否达到最大迭代次数
    if (iteration >= maxIterations) {
      log(`⚠️ 达到最大迭代次数 (${maxIterations})，结束 ReAct 循环`, 'warning');
    }
    
    log('🎉 ReAct 循环结束', 'success');
    
    // 返回消息历史，用于继续对话
    return { messages, renderer };
  } catch (error) {
    if (error.message === 'Request aborted by user') {
      log('⏹️ 请求已被用户中断', 'warning');
      // 即使被中断，也返回当前的消息历史
      return { messages, renderer };
    }
    log(`❌ 处理流式响应时发生错误: ${error.message}`, 'error', error);
    console.error('Error:', error);
    throw error;
  }
}

// 导出 renderWithAI 函数供外部使用
export { renderWithAI, callOpenAIWithTools };