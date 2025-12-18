/**
 * OpenAI API 集成示例（增量渲染模式 - 文本代码块模式）
 * 不使用工具调用，而是从模型输出的代码块中解析指令并立即执行渲染
 */

import { createIncrementalTextRenderer } from '../src/incremental-text-renderer.js';
import { incrementalSystemPrompt } from '../src/incremental-prompt.js';
import { MODEL_CONFIG } from '../modelConfig.js';

/**
 * 配置 OpenAI API 调用（不使用工具）
 * @param {Array} messages - 消息数组
 */
async function callOpenAIWithoutTools(messages) {
  const model = MODEL_CONFIG.model;
  const apiKey = MODEL_CONFIG.apiKey;
  
  // 清理和验证消息格式
  const cleanedMessages = messages.map(msg => {
    const cleaned = { role: msg.role };
    
    // 只保留 content 字段（不使用工具调用）
    if (msg.content) {
      cleaned.content = msg.content;
    } else {
      cleaned.content = '';
    }
    
    return cleaned;
  });
  
  const requestBody = {
    model: 'deepseek-chat',
    messages: cleanedMessages,
    stream: true,
    // 不设置 tools 和 tool_choice，让模型直接输出文本
  };
  
  console.log('API Request messages:', cleanedMessages.length, 'messages');
  
  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    let errorMessage = `API error: ${response.status} ${response.statusText}`;
    try {
      const errorData = await response.json();
      if (errorData.error) {
        errorMessage += ` - ${errorData.error.message || JSON.stringify(errorData.error)}`;
      } else {
        errorMessage += ` - ${JSON.stringify(errorData)}`;
      }
    } catch (e) {
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
 * 处理流式响应并渲染（增量渲染模式 - 文本代码块模式）
 * @param {string} prompt - 用户提示词
 * @param {HTMLElement} rootElement - 根元素
 * @param {object} options - 选项
 * @param {function} options.onLog - 日志回调函数 (message, type, data)
 * @param {Array} options.messages - 已有的消息历史（用于继续对话）
 * @param {AbortSignal} options.signal - 中断信号（用于停止）
 * @param {IncrementalTextRenderer} options.renderer - 已有的渲染器（用于继续对话）
 */
async function renderWithAIIncremental(prompt, rootElement, options = {}) {
  const { onLog, messages: existingMessages, signal, renderer: existingRenderer, onCommand } = options;
  
  // 日志辅助函数
  const log = (message, type = 'info', data = null) => {
    if (onLog) {
      onLog(message, type, data);
    }
    console.log(`[${type}]`, message, data || '');
  };

  // 使用已有的渲染器或创建新的
  const renderer = existingRenderer || createIncrementalTextRenderer(rootElement, {
    onToolCall: (result) => {
      if (result.success) {
        log(`✓ 指令执行成功: ${result.toolCall.name}`, 'success', result.toolCall);
      } else {
        log(`✗ 指令执行失败: ${result.error}`, 'error', result.toolCall);
      }
    },
    onError: (error) => {
      log(`❌ 渲染器错误: ${error.message}`, 'error', error);
    },
    onCommand: onCommand,
  });

  // 初始化消息数组
  let messages;
  if (existingMessages && Array.isArray(existingMessages)) {
    messages = JSON.parse(JSON.stringify(existingMessages));
  } else {
    messages = [
      {
        role: 'system',
        content: incrementalSystemPrompt,
      },
    ];
  }
  
  // 添加用户的新消息
  messages.push({
    role: 'user',
    content: prompt,
  });
  
  log(`📋 消息历史: ${messages.length} 条消息`, 'info');
  log(`📝 用户提示: ${prompt}`, 'info');

  try {
    log('🚀 开始调用 AI API（增量渲染模式 - 代码块解析）...', 'info');
    
    // 重置渲染器状态
    renderer.reset();
    
    // 调用 API（不使用工具）
    const stream = await callOpenAIWithoutTools(messages);
  
    // 处理流式响应
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finishReason = null;
    let hasCommands = false;

    while (true) {
      // 检查是否被中断
      if (signal && signal.aborted) {
        reader.cancel();
        log('⏹️ 用户中断了请求', 'warning');
        throw new Error('Request aborted by user');
      }
      
      const { done, value } = await reader.read();
      if (done) {
        log('📥 流式响应结束，处理剩余的指令...', 'info');
        
        // 处理剩余的指令
        const remainingCommands = renderer.flush();
        if (remainingCommands.length > 0) {
          log(`✅ 执行了 ${remainingCommands.length} 个剩余指令`, 'success');
          hasCommands = true;
        }
        
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim() === '') continue;
        
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            continue;
          }

          try {
            const chunk = JSON.parse(data);
            
            // 检查 finish_reason
            if (chunk.choices && Array.isArray(chunk.choices)) {
              for (const choice of chunk.choices) {
                if (choice.finish_reason) {
                  finishReason = choice.finish_reason;
                }
                
                // 提取文本内容
                if (choice.delta?.content) {
                  const textChunk = choice.delta.content;
                  
                  // 增量处理文本块，解析代码块并执行指令
                  const executedCommands = renderer.processTextChunk(textChunk);
                  
                  if (executedCommands.length > 0) {
                    hasCommands = true;
                    log(`⚡ 立即执行了 ${executedCommands.length} 个指令`, 'success', {
                      commands: executedCommands.map(cmd => cmd.command?.name || cmd.toolCall?.name)
                    });
                  }
                }
              }
            }
            
          } catch (e) {
            log(`⚠️ 解析数据块失败: ${e.message}`, 'warning', { error: e, line });
          }
        }
      }
    }
    
    // 获取 assistant 消息
    const assistantMessage = renderer.getAssistantMessage();
    
    // 添加到消息历史
    if (assistantMessage.content) {
      messages.push(assistantMessage);
      log(`💬 模型回复: ${assistantMessage.content.substring(0, 200)}${assistantMessage.content.length > 200 ? '...' : ''}`, 'info');
    }
    
    log('🎉 渲染完成', 'success');
    
    // 返回消息历史和渲染器
    return { messages, renderer };
  } catch (error) {
    if (error.message === 'Request aborted by user') {
      log('⏹️ 请求已被用户中断', 'warning');
      return { messages, renderer };
    }
    log(`❌ 处理流式响应时发生错误: ${error.message}`, 'error', error);
    throw error;
  }
}

// 导出函数供外部使用
export { renderWithAIIncremental, callOpenAIWithoutTools };
