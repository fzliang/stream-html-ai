/**
 * 主入口文件
 * 导出所有核心功能
 */

export { DOMManager } from './dom-manager.js';
export { tools, h, updateElement, setText, appendText, removeElement, getToolSchemas } from './tools.js';
export { ToolCallHandler } from './tool-handler.js';
export { StreamProcessor } from './stream-processor.js';
export { Renderer, createRenderer } from './renderer.js';

