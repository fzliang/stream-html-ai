/**
 * 工具函数集合
 * 这些函数将被注册为大模型的工具调用
 */

/**
 * 创建元素工具函数
 * @param {string} parentId - 父元素 ID，'root' 或 null 表示根容器
 * @param {string} tagName - HTML 标签名
 * @param {object} props - 元素属性
 * @returns {string} 生成的元素 ID
 */
export function h(parentId, tagName, props = {}) {
  if (!this.domManager) {
    throw new Error('DOMManager not initialized. Call setDOMManager first.');
  }

  // 验证参数
  if (!tagName || typeof tagName !== 'string') {
    throw new Error('tagName must be a non-empty string');
  }

  // 处理 parentId：如果是字符串 "null" 或 null，转换为 'root'
  if (parentId === 'null' || parentId === null || parentId === undefined) {
    parentId = 'root';
  }

  // 如果 parentId 无效，使用 root
  if (parentId && parentId !== 'root') {
    const parentElement = this.domManager.getElement(parentId);
    if (!parentElement) {
      console.warn(`Parent element "${parentId}" not found, using root instead`);
      parentId = 'root';
    }
  }

  return this.domManager.createElement(parentId || 'root', tagName, props);
}

/**
 * 更新元素属性
 * @param {string} elementId - 元素 ID
 * @param {object} props - 新的属性对象
 */
export function updateElement(elementId, props = {}) {
  if (!this.domManager) {
    throw new Error('DOMManager not initialized.');
  }

  if (!elementId || typeof elementId !== 'string') {
    throw new Error('elementId must be a non-empty string');
  }

  this.domManager.updateElement(elementId, props);
  return { success: true, elementId };
}

/**
 * 设置元素文本内容
 * @param {string} elementId - 元素 ID
 * @param {string} text - 文本内容
 */
export function setText(elementId, text) {
  if (!this.domManager) {
    throw new Error('DOMManager not initialized.');
  }

  if (!elementId || typeof elementId !== 'string') {
    throw new Error('elementId must be a non-empty string');
  }

  this.domManager.setText(elementId, String(text || ''));
  return { success: true, elementId };
}

/**
 * 追加文本内容（用于流式文本输出）
 * @param {string} elementId - 元素 ID
 * @param {string} text - 要追加的文本
 */
export function appendText(elementId, text) {
  if (!this.domManager) {
    throw new Error('DOMManager not initialized.');
  }

  if (!elementId || typeof elementId !== 'string') {
    throw new Error('elementId must be a non-empty string');
  }

  this.domManager.appendText(elementId, String(text || ''));
  return { success: true, elementId };
}

/**
 * 删除元素
 * @param {string} elementId - 元素 ID
 */
export function removeElement(elementId) {
  if (!this.domManager) {
    throw new Error('DOMManager not initialized.');
  }

  if (!elementId || typeof elementId !== 'string') {
    throw new Error('elementId must be a non-empty string');
  }

  this.domManager.removeElement(elementId);
  return { success: true, elementId };
}

/**
 * 工具函数注册表
 * 用于将函数名映射到实际函数
 */
export const tools = {
  h,
  updateElement,
  setText,
  appendText,
  removeElement,
};

/**
 * 获取工具调用的 JSON Schema（用于大模型工具定义）
 */
export function getToolSchemas() {
  return [
    {
      name: 'h',
      description: '创建 HTML 元素。在指定父元素下创建新元素，返回生成的元素 ID。',
      parameters: {
        type: 'object',
        properties: {
          parentId: {
            type: ['string', 'null'],
            description: '父元素的 ID，null 或 "root" 表示根容器',
          },
          tagName: {
            type: 'string',
            description: 'HTML 标签名，如 "div", "span", "p", "h1" 等',
          },
          props: {
            type: 'object',
            description: '元素属性对象，可包含 id, className, style, textContent, onClick 等',
            properties: {
              id: { type: 'string', description: '元素 ID（可选，系统会自动生成）' },
              className: { type: 'string', description: 'CSS 类名' },
              style: { type: 'object', description: '内联样式对象' },
              textContent: { type: 'string', description: '元素的文本内容（可选，如果提供则会在创建时设置文本，减少一次 setText 调用）' },
            },
            additionalProperties: true,
          },
        },
        required: ['parentId', 'tagName'],
      },
    },
    {
      name: 'updateElement',
      description: '更新已存在元素的属性',
      parameters: {
        type: 'object',
        properties: {
          elementId: {
            type: 'string',
            description: '要更新的元素 ID',
          },
          props: {
            type: 'object',
            description: '新的属性对象（部分更新）',
            additionalProperties: true,
          },
        },
        required: ['elementId', 'props'],
      },
    },
    {
      name: 'setText',
      description: '设置元素的文本内容（会清空现有子元素）',
      parameters: {
        type: 'object',
        properties: {
          elementId: {
            type: 'string',
            description: '目标元素 ID',
          },
          text: {
            type: 'string',
            description: '文本内容',
          },
        },
        required: ['elementId', 'text'],
      },
    },
    {
      name: 'appendText',
      description: '在元素末尾追加文本节点（用于流式文本输出）',
      parameters: {
        type: 'object',
        properties: {
          elementId: {
            type: 'string',
            description: '目标元素 ID',
          },
          text: {
            type: 'string',
            description: '要追加的文本',
          },
        },
        required: ['elementId', 'text'],
      },
    },
    {
      name: 'removeElement',
      description: '从 DOM 中删除指定元素及其所有子元素',
      parameters: {
        type: 'object',
        properties: {
          elementId: {
            type: 'string',
            description: '要删除的元素 ID',
          },
        },
        required: ['elementId'],
      },
    },
  ];
}

