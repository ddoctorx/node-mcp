# MCP 管理系统

这是一个简单的 MCP（Model Control Protocol）管理系统，允许您连接和管理多个 MCP 服务，并通过 OpenAI API 与这些工具对话。

## 功能

- 🚀 注册和管理多个 MCP 服务
- 🔌 支持 stdio 和 sse 类型的 MCP
- 🔧 查看和调用 MCP 提供的工具
- 💬 通过 OpenAI API 与 MCP 工具对话
- 🤖 支持 OpenAI 的函数调用功能

## 安装

1. 克隆项目

```bash
git clone https://github.com/yourusername/node-mcp.git
cd node-mcp
```

2. 安装依赖

```bash
npm install
```

3. 配置环境变量

```bash
cp .env.example .env
```

然后编辑`.env`文件，填写您的 OpenAI API 密钥:

```
OPENAI_API_KEY=your_openai_api_key_here
```

## 启动

```bash
npm start
```

服务器将在 http://localhost:3000 启动。

## 使用说明

### 添加 MCP 服务

1. 打开浏览器访问 http://localhost:3000
2. 在"添加 MCP"标签页中填写表单:
   - 名称: 为 MCP 服务指定一个名称
   - 类型: 选择 stdio 或 sse
   - 命令: 例如 `npx -y @stripe/mcp --tools=all --api-key=YOUR_KEY`, `npx -y external-mcp-service`
   - URL: 如果选择 SSE 类型，填写 SSE 服务器的 URL，例如 `http://localhost:3100`
3. 点击"添加 MCP"按钮

### SSE 类型 MCP 服务器

SSE (Server-Sent Events) 类型的 MCP 是通过 HTTP API 通信的 MCP 服务。系统现已支持真实外部 SSE MCP 服务器，与 stdio 类型的 MCP 相比，SSE 类型具有以下优势：

- 不需要在本地运行子进程
- 可以连接到远程服务器上的 MCP
- 更稳定的通信方式
- 可以使用任何编程语言实现

#### 尝试示例 SSE MCP 服务器

项目包含一个简单的 SSE MCP 服务器示例，可以按照以下步骤运行：

1. 在一个新的终端窗口中运行示例服务器：

```bash
node examples/sse-mcp-server.js
```

2. 服务器将在端口 3100 上启动，提供两个示例工具：

   - `weather`: 获取指定城市的天气信息
   - `calculator`: 执行简单的数学计算

3. 然后在 MCP 管理系统中添加一个新的 SSE 类型 MCP：

   - 名称: `sse-demo`
   - 类型: `sse`
   - URL: `http://localhost:3100`

4. 添加后，您可以在聊天中使用这些工具，例如：
   - "查询北京的天气"
   - "计算 (15 \* 5) - 3 的结果"

#### 实现自己的 SSE MCP 服务器

如果您想实现自己的 SSE MCP 服务器，需要实现以下 API 端点：

1. **GET /ping**: 健康检查接口，返回服务器状态
2. **GET /tools**: 返回可用工具列表
3. **POST /call**: 接受工具调用请求并返回结果

请参考 `examples/sse-mcp-server.js` 了解详细的实现方式。

### 使用聊天功能

1. 添加至少一个 MCP 服务
2. 切换到"聊天"标签页
3. 在输入框中输入消息，例如询问如何使用某个工具
4. AI 会根据您的问题提供回答，并在需要时调用 MCP 工具

### 示例对话

用户: "我需要查询天气信息"

AI: "我可以帮您查询天气信息。请告诉我您想查询哪个城市的天气？"

用户: "北京"

AI: _调用天气工具_ "北京当前天气为晴，温度 22°C，湿度 45%..."

## 开发

### 项目结构

- `src/server.js`: 主服务器文件
- `src/openai.js`: OpenAI API 集成
- `src/tools/`: 内置工具目录
- `public/`: 前端文件
- `examples/`: 示例代码和演示服务器

### 添加新工具

1. 在`src/tools/`目录下创建新的工具文件
2. 在`src/tools/index.js`中注册工具
3. 工具必须实现`execute`方法

## MCP 通信协议

### STDIO 类型

STDIO 类型 MCP 通过标准输入/输出与主系统通信，协议格式为 JSON。

### SSE 类型

SSE 类型 MCP 通过 HTTP API 与主系统通信：

- 工具获取：GET 请求到 `/tools`
- 工具调用：POST 请求到 `/call`
- 健康检查：GET 请求到 `/ping`

## 许可证

MIT

{
"mcpServers": {
"amap-maps": {
"command": "npx",
"args": [
"-y",
"@amap/amap-maps-mcp-server"
],
"env": {
"AMAP_MAPS_API_KEY": "93ca077d25089952fc2f9e2ab2ad4db2"
}
}
}
}
