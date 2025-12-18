/**
 * 增量文本解析器
 * 从模型输出的文本流中解析代码块，提取渲染指令
 */

export class IncrementalTextParser {
  constructor() {
    // 当前正在累积的代码块内容
    this.currentCodeBlock = null;
    // 当前代码块的语言标识
    this.currentLanguage = null;
    // 已解析的完整指令
    this.parsedCommands = [];
    // 用于累积文本的缓冲区
    this.textBuffer = '';
  }

  /**
   * 处理文本块，返回已解析的完整指令
   * @param {string} textChunk - 文本块
   * @returns {Array} 已解析的指令数组
   */
  parseTextChunk(textChunk) {
    const newCommands = [];
    this.textBuffer += textChunk;

    // 查找所有完整的代码块（从 ``` 开始到 ``` 结束）
    // 使用非贪婪匹配，找到第一个完整的代码块
    let searchStart = 0;
    
    while (true) {
      // 查找代码块开始标记
      const codeBlockStart = this.textBuffer.indexOf('```', searchStart);
      if (codeBlockStart === -1) {
        break;
      }
      
      // 查找代码块结束标记（在开始标记之后）
      const afterStart = this.textBuffer.substring(codeBlockStart + 3);
      const codeBlockEnd = afterStart.indexOf('```');
      
      if (codeBlockEnd === -1) {
        // 没有找到结束标记，说明代码块还未完成
        // 记录当前代码块的位置
        const languageMatch = afterStart.match(/^(\w+)?\n?/);
        const language = (languageMatch ? (languageMatch[1] || '') : '').toLowerCase();
        
        // 检查这个代码块是否已经被处理过
        if (this.currentCodeBlock === null || 
            (this.currentCodeBlock.startIndex || 0) !== codeBlockStart) {
          this.currentCodeBlock = { startIndex: codeBlockStart };
          this.currentLanguage = language;
        }
        break;
      }
      
      // 找到完整的代码块
      const fullCodeBlock = this.textBuffer.substring(codeBlockStart, codeBlockStart + 3 + codeBlockEnd + 3);
      
      // 提取语言标识和代码内容
      const languageMatch = fullCodeBlock.match(/^```(\w+)?\n?/);
      const language = (languageMatch ? (languageMatch[1] || '') : '').toLowerCase();
      const codeStart = languageMatch ? languageMatch[0].length : 3;
      const codeContent = fullCodeBlock.substring(codeStart, fullCodeBlock.length - 3).trim();
      
      // 解析代码块中的指令
      const commands = this.parseCodeBlock(codeContent, language);
      newCommands.push(...commands);
      
      // 移除已处理的代码块（保留结束标记之后的内容）
      this.textBuffer = this.textBuffer.substring(0, codeBlockStart) + 
                       this.textBuffer.substring(codeBlockStart + 3 + codeBlockEnd + 3);
      
      // 重置当前代码块状态
      this.currentCodeBlock = null;
      this.currentLanguage = null;
      
      // 继续查找下一个代码块
      searchStart = 0;
    }

    return newCommands;
  }

  /**
   * 解析代码块内容，提取渲染指令
   * @param {string} codeContent - 代码块内容
   * @param {string} language - 代码块语言标识
   * @returns {Array} 解析出的指令数组
   */
  parseCodeBlock(codeContent, language) {
    const commands = [];
    
    // 只处理 render 或 json 代码块
    if (language !== 'render' && language !== 'json' && language !== 'javascript' && language !== 'js') {
      return commands;
    }

    try {
      // 尝试解析为 JSON
      let data;
      
      // 如果是数组，直接解析
      if (codeContent.trim().startsWith('[')) {
        data = JSON.parse(codeContent);
        if (Array.isArray(data)) {
          // 数组中的每个元素都是一个指令
          for (const item of data) {
            if (this.isValidCommand(item)) {
              commands.push(item);
            }
          }
        }
      } 
      // 如果是单个对象
      else if (codeContent.trim().startsWith('{')) {
        data = JSON.parse(codeContent);
        if (this.isValidCommand(data)) {
          commands.push(data);
        }
      }
      // 如果是多行格式（每行一个 JSON 对象）
      else {
        const lines = codeContent.split('\n').filter(line => line.trim());
        for (const line of lines) {
          try {
            const item = JSON.parse(line.trim());
            if (this.isValidCommand(item)) {
              commands.push(item);
            }
          } catch (e) {
            // 忽略无法解析的行
          }
        }
      }
    } catch (e) {
      // JSON 解析失败，尝试其他格式
      console.warn('Failed to parse code block as JSON:', e);
    }

    return commands;
  }

  /**
   * 验证指令是否有效
   * @param {object} command - 指令对象
   * @returns {boolean} 是否有效
   */
  isValidCommand(command) {
    if (!command || typeof command !== 'object') {
      return false;
    }
    
    // 必须有 name 字段
    if (!command.name || typeof command.name !== 'string') {
      return false;
    }
    
    // 必须有 arguments 字段（可以是对象或字符串）
    if (!command.arguments) {
      return false;
    }
    
    return true;
  }

  /**
   * 处理流结束，返回所有剩余已解析的指令
   * @returns {Array} 剩余的指令数组
   */
  flush() {
    const remainingCommands = [];
    
    // 如果还有未完成的代码块，尝试解析
    if (this.currentCodeBlock !== null && this.textBuffer) {
      const codeStart = (this.currentCodeBlock.startIndex || 0) + 
                       (this.currentLanguage ? this.currentLanguage.length + 4 : 4);
      const codeContent = this.textBuffer.substring(codeStart).trim();
      
      if (codeContent) {
        const commands = this.parseCodeBlock(codeContent, this.currentLanguage);
        remainingCommands.push(...commands);
      }
    }
    
    // 重置状态
    this.currentCodeBlock = null;
    this.currentLanguage = null;
    this.textBuffer = '';
    
    return remainingCommands;
  }

  /**
   * 重置解析器状态
   */
  reset() {
    this.currentCodeBlock = null;
    this.currentLanguage = null;
    this.parsedCommands = [];
    this.textBuffer = '';
  }
}
