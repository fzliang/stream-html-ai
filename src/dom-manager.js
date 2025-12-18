/**
 * DOM 管理器
 * 负责维护元素 ID 到真实 DOM 节点的映射，管理父子关系
 */
export class DOMManager {
  constructor(rootElement) {
    this.rootElement = rootElement || document.body;
    this.elements = new Map(); // elementId -> { node, parentId, children }
    this.idCounter = 0;
  }

  /**
   * 生成唯一 ID
   */
  generateId() {
    return `element_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 获取元素信息
   */
  getElement(elementId) {
    return this.elements.get(elementId);
  }

  /**
   * 获取父元素节点
   */
  getParentNode(parentId) {
    if (!parentId || parentId === 'root') {
      return this.rootElement;
    }
    const parentElement = this.elements.get(parentId);
    return parentElement ? parentElement.node : this.rootElement;
  }

  /**
   * 创建元素
   * @param {string} parentId - 父元素 ID
   * @param {string} tagName - 标签名
   * @param {object} props - 属性对象
   * @returns {string} 生成的元素 ID
   */
  createElement(parentId, tagName, props = {}) {
    // 生成或使用提供的 ID
    const elementId = props.id || this.generateId();
    
    // 如果元素已存在，先删除
    if (this.elements.has(elementId)) {
      this.removeElement(elementId);
    }

    // 创建 DOM 节点
    const node = document.createElement(tagName);

    // 设置属性
    this.setProps(node, props);

    // 获取父节点并插入
    const parentNode = this.getParentNode(parentId);
    
    // 添加飞入动画（从右侧飞入）
    // 在插入前设置初始状态：完全透明，从右侧偏移
    node.style.opacity = '0';
    node.style.transform = 'translateX(50px)';
    
    parentNode.appendChild(node);
    
    // 触发飞入动画（使用 requestAnimationFrame 确保 DOM 已渲染）
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        node.style.transition = 'opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1), transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
        node.style.opacity = '1';
        node.style.transform = 'translateX(0)';
        
        // 动画结束后移除内联样式，让 CSS transition 接管
        node.addEventListener('transitionend', function handler() {
          node.style.opacity = '';
          node.style.transform = '';
          node.style.transition = '';
          node.removeEventListener('transitionend', handler);
        }, { once: true });
      });
    });

    // 记录元素信息
    const elementInfo = {
      node,
      parentId: parentId || 'root',
      children: new Set(),
    };
    this.elements.set(elementId, elementInfo);

    // 更新父元素的子元素集合
    if (parentId && parentId !== 'root') {
      const parentInfo = this.elements.get(parentId);
      if (parentInfo) {
        parentInfo.children.add(elementId);
      }
    }

    return elementId;
  }

  /**
   * 设置元素属性
   */
  setProps(node, props) {
    // 排除特殊属性
    const { id, children, textContent, ...restProps } = props;

    // 如果提供了 textContent，先设置文本内容
    if (textContent !== undefined && textContent !== null) {
      node.textContent = String(textContent);
    }

    for (const [key, value] of Object.entries(restProps)) {
      if (key === 'className') {
        node.className = value;
      } else if (key === 'style' && typeof value === 'object') {
        Object.assign(node.style, value);
      } else if (key.startsWith('on') && typeof value === 'function') {
        // 事件处理器
        const eventName = key.slice(2).toLowerCase();
        node.addEventListener(eventName, value);
      } else if (key === 'dangerouslySetInnerHTML') {
        // 支持设置 HTML（谨慎使用）
        node.innerHTML = value.__html || value;
      } else {
        // 标准 HTML 属性
        node.setAttribute(key, value);
      }
    }
  }

  /**
   * 更新元素属性
   * @param {string} elementId - 元素 ID
   * @param {object} props - 新的属性对象
   */
  updateElement(elementId, props) {
    const elementInfo = this.elements.get(elementId);
    if (!elementInfo) {
      throw new Error(`Element with id "${elementId}" not found`);
    }

    this.setProps(elementInfo.node, props);
    
    // 如果更新了 id，需要更新映射
    if (props.id && props.id !== elementId) {
      const oldId = elementId;
      const newId = props.id;
      
      // 更新映射
      this.elements.set(newId, elementInfo);
      this.elements.delete(oldId);
      
      // 更新父元素的子元素集合
      if (elementInfo.parentId && elementInfo.parentId !== 'root') {
        const parentInfo = this.elements.get(elementInfo.parentId);
        if (parentInfo) {
          parentInfo.children.delete(oldId);
          parentInfo.children.add(newId);
        }
      }
    }
  }

  /**
   * 设置文本内容
   * @param {string} elementId - 元素 ID
   * @param {string} text - 文本内容
   */
  setText(elementId, text) {
    const elementInfo = this.elements.get(elementId);
    if (!elementInfo) {
      throw new Error(`Element with id "${elementId}" not found`);
    }

    // 清空现有内容
    elementInfo.node.textContent = text;
  }

  /**
   * 追加文本内容
   * @param {string} elementId - 元素 ID
   * @param {string} text - 要追加的文本
   */
  appendText(elementId, text) {
    const elementInfo = this.elements.get(elementId);
    if (!elementInfo) {
      throw new Error(`Element with id "${elementId}" not found`);
    }

    elementInfo.node.textContent += text;
  }

  /**
   * 删除元素
   * @param {string} elementId - 元素 ID
   */
  removeElement(elementId) {
    const elementInfo = this.elements.get(elementId);
    if (!elementInfo) {
      return; // 元素不存在，静默返回
    }

    // 递归删除所有子元素
    for (const childId of elementInfo.children) {
      this.removeElement(childId);
    }

    // 从父元素的子元素集合中移除
    if (elementInfo.parentId && elementInfo.parentId !== 'root') {
      const parentInfo = this.elements.get(elementInfo.parentId);
      if (parentInfo) {
        parentInfo.children.delete(elementId);
      }
    }

    // 从 DOM 中移除
    if (elementInfo.node.parentNode) {
      elementInfo.node.parentNode.removeChild(elementInfo.node);
    }

    // 从映射中移除
    this.elements.delete(elementId);
  }

  /**
   * 清空所有元素
   */
  clear() {
    // 删除所有元素
    for (const elementId of this.elements.keys()) {
      const elementInfo = this.elements.get(elementId);
      if (elementInfo.node.parentNode) {
        elementInfo.node.parentNode.removeChild(elementInfo.node);
      }
    }
    this.elements.clear();
  }

  /**
   * 获取元素树结构（用于调试）
   */
  getTree() {
    const tree = {};
    for (const [id, info] of this.elements.entries()) {
      tree[id] = {
        tagName: info.node.tagName.toLowerCase(),
        parentId: info.parentId,
        children: Array.from(info.children),
      };
    }
    return tree;
  }
}

