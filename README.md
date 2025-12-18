# 流式 HTML 渲染系统

一个将大模型流式输出转换为实时 DOM 渲染的系统，通过工具调用实现类似 React 底层操作的指令式渲染。

## 核心特性

- 🚀 **流式渲染**：支持大模型流式返回过程中的实时 DOM 更新
- 🛠️ **工具调用**：将 HTML 输出转换为工具调用，一条一条执行
- 🎯 **指令式 API**：类似 React.createElement，但适配流式场景
- 📦 **轻量级**：无依赖，纯 JavaScript 实现
- 🔧 **可扩展**：支持自定义工具函数和插件

## 快速开始

### 安装

```bash
npm install
```

### 基础使用

```javascript
import { createRenderer } from './src/renderer.js';

// 创建渲染器
const renderer = createRenderer('#app');

// 执行工具调用
renderer.executeToolCall({
  name: 'h',
  arguments: JSON.stringify({
    parentId: 'root',
    tagName: 'div',
    props: { id: 'container', className: 'my-class' }
  })
});

renderer.executeToolCall({
  name: 'setText',
  arguments: JSON.stringify({
    elementId: 'container',
    text: 'Hello World'
  })
});
```

### 流式处理

```javascript
// 模拟流式工具调用
const toolCalls = [
  { name: 'h', arguments: '...' },
  { name: 'setText', arguments: '...' },
  // ...
];

// 处理流式响应
await renderer.renderStream(toolCalls);
```

## API 文档

### 工具函数

#### `h(parentId, tagName, props)`

创建 HTML 元素。

**参数**：
- `parentId` (string|null): 父元素 ID，`null` 或 `'root'` 表示根容器
- `tagName` (string): HTML 标签名
- `props` (object): 元素属性

**返回**：生成的元素 ID

#### `setText(elementId, text)`

设置元素文本内容。

#### `appendText(elementId, text)`

追加文本内容（用于流式文本输出）。

#### `updateElement(elementId, props)`

更新元素属性。

#### `removeElement(elementId)`

删除元素及其所有子元素。

### Renderer 类

#### `createRenderer(rootElement, options)`

创建渲染器实例。

**参数**：
- `rootElement` (HTMLElement|string): 根元素或选择器
- `options` (object): 配置选项
  - `onToolCall`: 工具调用回调
  - `onError`: 错误回调
  - `batchSize`: 批量处理大小
  - `debounceMs`: 防抖延迟

#### `renderer.renderStream(stream)`

处理流式响应。

#### `renderer.executeToolCall(toolCall)`

执行单个工具调用。

#### `renderer.clear()`

清空所有渲染内容。

## 使用场景

### 场景 1: 流式渲染文章

```javascript
// 模型输出一系列工具调用
h('root', 'article', { id: 'article-1' })
h('article-1', 'h1', { id: 'title' })
setText('title', '我的文章标题')
h('article-1', 'p', { id: 'para-1' })
appendText('para-1', '这是第一段...')
```

### 场景 2: 动态表单

```javascript
h('root', 'form', { id: 'my-form' })
h('my-form', 'input', { type: 'text', placeholder: '姓名' })
h('my-form', 'button', { type: 'submit' })
setText('button-id', '提交')
```

## 技术架构

详见 [TECHNICAL_DESIGN.md](./TECHNICAL_DESIGN.md)

## 示例

查看 [examples/basic-usage.html](./examples/basic-usage.html) 了解基础用法。

## 许可证

ISC

