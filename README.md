# MCP 管理系统

这是一个简单的 MCP（Model Control Protocol）管理系统，允许您连接和管理多个 MCP 服务，并通过 OpenAI API 与这些工具对话。

## 功能

- 🚀 注册和管理多个 MCP 服务
- 🔌 支持 stdio 和 sse 类型的 MCP
- 🔧 查看和调用 MCP 提供的工具
- 💬 通过 OpenAI API 与 MCP 工具对话
- 🤖 支持 OpenAI 的函数调用功能
- 📦 支持自动安装依赖包（如 pip 包）

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

## 日志系统说明

系统使用 Winston 日志库进行全面的日志记录，记录了以下关键流程：

1. **MCP 注册与配置**：记录 MCP 注册过程和配置信息
2. **OpenAI API 调用**：记录 API 请求和响应，包括请求参数和响应内容
3. **MCP 工具调用**：记录工具调用参数和结果
4. **函数调用处理**：记录函数调用检测和处理结果

### 日志特点

- **结构化日志**：所有日志采用结构化格式，便于后续分析
- **多级别日志**：支持 debug、info、warn、error 等多个日志级别
- **控制台和文件输出**：日志同时输出到控制台和文件（logs 目录下）
- **性能监控**：记录各操作的响应时间，帮助性能分析
- **敏感信息过滤**：自动过滤 API 密钥等敏感信息
- **请求关联**：使用请求 ID 关联同一请求的不同日志
- **模块化设计**：为不同组件提供专门的日志接口

### 日志配置

可通过环境变量配置日志级别：

```
LOG_LEVEL=debug  # 可选值: error, warn, info, debug
```

### 日志文件位置

- 错误日志：`logs/error.log`
- 完整日志：`logs/combined.log`

## 新功能：UVX MCP Server 支持

现在支持直接使用预定义的 UVX MCP Server，例如 fetch 服务器。预定义的服务器配置存储在`config/mcp-servers.json`中。

### 如何使用

可以通过 API 调用来连接预定义的 MCP 服务器：

```javascript
// 连接UVX Fetch MCP服务器
fetch('/api/mcp', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    sessionId: 'your-session-id',
    name: 'fetch',
    predefinedServer: 'fetch',
  }),
})
  .then(response => response.json())
  .then(data => console.log(data));
```

### 查看可用的预定义服务器

```javascript
fetch('/api/mcp/predefined')
  .then(response => response.json())
  .then(data => console.log(data.servers));
```

### 自定义预定义服务器

可以通过 API 更新预定义服务器配置：

```javascript
fetch('/api/mcp/predefined/update', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    config: {
      mcpServers: {
        fetch: {
          command: 'uvx',
          args: ['mcp-server-fetch'],
          description: 'UVX Fetch MCP服务器',
        },
        // 添加更多预定义服务器...
      },
    },
  }),
})
  .then(response => response.json())
  .then(data => console.log(data));
```

## MCP 配置说明

您可以在 `config/mcp-servers.json` 文件中预配置 MCP 服务器。系统支持自动安装依赖，例如：

```json
{
  "mcpServers": {
    "fetch": {
      "command": "python",
      "args": ["-m", "mcp_server_fetch"],
      "description": "Python Fetch MCP服务器",
      "setup": {
        "command": "pip",
        "args": ["install", "mcp-server-fetch"],
        "description": "安装mcp-server-fetch包"
      }
    }
  }
}
```

这个配置会：

1. 首先执行 `pip install mcp-server-fetch` 命令安装必要的依赖
2. 然后执行 `python -m mcp_server_fetch` 启动 MCP 服务

通过这种方式，您可以无需手动预安装依赖，系统会自动处理安装步骤。

填写 git repo 的 地址 和 token
仓库里面提供运行脚本例如 `run.sh` 支持 node 和 python
服务器 会创建一个文件夹，然后在这个文件夹下面来把 git 代码拉取过来，接着帮他起一个服务
然后和当前 session 关联起来

## 许可证

MIT
