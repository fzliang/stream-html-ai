# 流式 HTML 渲染技术方案

## 核心概念

将大模型的 HTML 输出转换为一系列工具调用，实现类似 React 底层 DOM 操作的指令式渲染，支持流式实时更新。

## 设计目标

1. **指令式渲染**：每个工具调用对应一个原子 DOM 操作
2. **流式处理**：支持大模型流式返回过程中的实时渲染
3. **无状态工具**：工具函数本身不维护状态，通过 parentId 建立关系
4. **类似 React**：API 设计参考 React.createElement，但适配流式场景

## 工具函数设计

### 1. `h(parentId, tagName, props)` - 创建元素

**功能**：在指定父元素下创建新元素

**参数**：
- `parentId` (string): 父元素的 ID，`null` 或 `'root'` 表示根容器
- `tagName` (string): HTML 标签名，如 `'div'`, `'span'`, `'p'` 等
- `props` (object): 元素属性，包括：
  - `id`: 自定义 ID（可选，系统会自动生成）
  - `className`: CSS 类名
  - `style`: 内联样式对象
  - `onClick`, `onChange` 等事件处理器
  - 其他标准 HTML 属性

**返回**：生成的元素 ID（string）

**示例**：
```javascript
h('root', 'div', { className: 'container', id: 'main' })
h('main', 'h1', { style: { color: 'red' } })
```

### 2. `updateElement(elementId, props)` - 更新元素

**功能**：更新已存在元素的属性

**参数**：
- `elementId` (string): 要更新的元素 ID
- `props` (object): 新的属性对象（部分更新）

**示例**：
```javascript
updateElement('main', { style: { backgroundColor: 'blue' } })
```

### 3. `setText(elementId, text)` - 设置文本内容

**功能**：设置元素的文本内容（会清空现有子元素）

**参数**：
- `elementId` (string): 目标元素 ID
- `text` (string): 文本内容

**示例**：
```javascript
setText('title', 'Hello World')
```

### 4. `removeElement(elementId)` - 删除元素

**功能**：从 DOM 中删除指定元素及其所有子元素

**参数**：
- `elementId` (string): 要删除的元素 ID

**示例**：
```javascript
removeElement('old-element')
```

### 5. `appendText(elementId, text)` - 追加文本

**功能**：在元素末尾追加文本节点（用于流式文本输出）

**参数**：
- `elementId` (string): 目标元素 ID
- `text` (string): 要追加的文本

**示例**：
```javascript
appendText('content', 'Hello ')
appendText('content', 'World') // 结果：Hello World
```

## 系统架构

### 1. DOM 管理器 (DOMManager)

**职责**：
- 维护元素 ID 到真实 DOM 节点的映射
- 管理父子关系
- 自动生成唯一 ID
- 提供 DOM 操作接口

**数据结构**：
```javascript
{
  elements: Map<elementId, {
    node: HTMLElement,
    parentId: string | null,
    children: Set<elementId>
  }>,
  rootElement: HTMLElement
}
```

### 2. 工具调用处理器 (ToolCallHandler)

**职责**：
- 解析大模型返回的工具调用
- 验证参数
- 调用对应的 DOM 操作函数
- 处理错误和异常

### 3. 流式处理器 (StreamProcessor)

**职责**：
- 处理流式响应
- 解析工具调用 JSON
- 按顺序执行工具调用
- 支持增量更新

### 4. 前端渲染引擎 (Renderer)

**职责**：
- 实时更新浏览器 DOM
- 优化渲染性能（批量更新）
- 处理事件绑定

## 工作流程

```
大模型流式输出
    ↓
解析工具调用 JSON
    ↓
验证工具名称和参数
    ↓
调用对应工具函数
    ↓
DOM 管理器执行操作
    ↓
实时更新浏览器 DOM
```

## 实现细节

### ID 生成策略

- 如果用户提供 `props.id`，使用用户 ID
- 否则自动生成：`element_${timestamp}_${random}`

### 父子关系管理

- 通过 `parentId` 建立父子关系
- 删除元素时递归删除所有子元素
- 维护双向引用（父→子，子→父）

### 性能优化

1. **批量更新**：收集多个工具调用，批量执行 DOM 操作
2. **虚拟 DOM 对比**：可选，对于复杂场景
3. **防抖/节流**：控制更新频率

### 错误处理

- 无效的 parentId → 创建到根元素
- 不存在的 elementId → 抛出错误
- 无效的标签名 → 使用 `div` 作为默认值

## 使用场景示例

### 场景 1：流式渲染文章

```javascript
// 模型输出一系列工具调用
h('root', 'article', { id: 'article-1' })
h('article-1', 'h1', { id: 'title' })
setText('title', '我的文章标题')
h('article-1', 'p', { id: 'para-1' })
appendText('para-1', '这是第一段...')
appendText('para-1', '继续添加内容...')
```

### 场景 2：动态表单

```javascript
h('root', 'form', { id: 'my-form' })
h('my-form', 'input', { type: 'text', placeholder: '姓名' })
h('my-form', 'button', { type: 'submit' })
setText('button-id', '提交')
```

## 扩展性考虑

1. **自定义工具**：允许注册自定义工具函数
2. **插件系统**：支持扩展功能（如动画、过渡效果）
3. **状态管理**：可选的状态管理机制
4. **服务端渲染**：支持 SSR 场景

## 技术栈建议

- **前端**：原生 JavaScript 或 TypeScript
- **构建工具**：Vite 或 Webpack
- **测试**：Jest + Testing Library
- **文档**：JSDoc

