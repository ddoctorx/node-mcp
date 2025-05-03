好的，让我们为您制定一个完整的重构计划。首先列举所有需要实现的模块，然后规划重构步骤：

## 重构计划概览

### 模块映射分析

| 原始模块                               | 六边形架构层级         | 新模块名称                                               |
| -------------------------------------- | ---------------------- | -------------------------------------------------------- |
| domain entities (Session, McpInstance) | Domain                 | domain/entities/                                         |
| registry.js                            | Domain Service         | domain/services/instance-registry.js                     |
| logger.js                              | Infrastructure         | infrastructure/logging/winston-logger.js                 |
| mcp-pool.js                            | Application Service    | application/services/mcp-pool-service.js                 |
| lifecycle-manager.js                   | Application Service    | application/services/lifecycle-service.js                |
| openai.js                              | Infrastructure Adapter | infrastructure/adapters/outbound/chat/openai-service.js  |
| proxy.js                               | Infrastructure Adapter | infrastructure/adapters/inbound/http/proxy-controller.js |
| server.js                              | Infrastructure         | infrastructure/config/server-setup.js                    |
| Http Controllers                       | Infrastructure Adapter | infrastructure/adapters/inbound/http/                    |
| MCP Connectors                         | Infrastructure Adapter | infrastructure/adapters/outbound/mcp/                    |
| WebSocket                              | Infrastructure Adapter | infrastructure/adapters/inbound/websocket/               |

## 详细重构计划

### 第一阶段：核心域和端口定义

1. **Domain 模型**

   - `domain/entities/session.js`
   - `domain/entities/mcp-instance.js`
   - `domain/value-objects/mcp-config.js`
   - `domain/services/instance-registry.js`

2. **端口定义**
   - `application/ports/inbound/` - 所有入站端口
   - `application/ports/outbound/` - 所有出站端口

### 第二阶段：基础设施适配器

3. **日志系统**

   - `infrastructure/logging/winston-logger.js`
   - `infrastructure/logging/logger-port-impl.js`

4. **持久化仓储**
   - `infrastructure/adapters/outbound/persistence/in-memory-session-repository.js`
   - `infrastructure/adapters/outbound/persistence/chat-history-repository.js`

### 第三阶段：MCP 连接管理

5. **MCP 连接器**

   - `infrastructure/adapters/outbound/mcp/stdio-mcp-connector.js`
   - `infrastructure/adapters/outbound/mcp/sse-mcp-connector.js`
   - `infrastructure/adapters/outbound/mcp/mcp-connector-factory.js`

6. **MCP 池管理**
   - `application/services/mcp-pool-service.js`
   - `infrastructure/adapters/outbound/mcp/mcp-pool-adapter.js`

### 第四阶段：应用服务

7. **会话管理**

   - `application/services/session-manager-service.js`

8. **生命周期管理**

   - `application/services/lifecycle-service.js`
   - `infrastructure/adapters/outbound/lifecycle/lifecycle-adapter.js`

9. **MCP 管理**

   - `application/services/mcp-manager-service.js`

10. **聊天管理**
    - `application/services/chat-manager-service.js`

### 第五阶段：外部服务集成

11. **OpenAI 集成**

    - `infrastructure/adapters/outbound/chat/openai-service.js`
    - `infrastructure/adapters/outbound/chat/chat-service-adapter.js`

12. **通知系统**
    - `infrastructure/adapters/outbound/notification/socket-notifier.js`

### 第六阶段：入站适配器

13. **HTTP 控制器**

    - `infrastructure/adapters/inbound/http/session-controller.js`
    - `infrastructure/adapters/inbound/http/mcp-controller.js`
    - `infrastructure/adapters/inbound/http/chat-controller.js`
    - `infrastructure/adapters/inbound/http/proxy-controller.js`
    - `infrastructure/adapters/inbound/http/pool-controller.js`

14. **WebSocket 处理**
    - `infrastructure/adapters/inbound/websocket/websocket-adapter.js`
    - `infrastructure/adapters/inbound/websocket/session-notifier.js`

### 第七阶段：配置和组装

15. **配置管理**

    - `infrastructure/config/env-config.js`
    - `infrastructure/config/mcp-config-loader.js`
    - `infrastructure/config/predefined-servers.js`

16. **依赖注入容器**

    - `infrastructure/config/container.js`

17. **路由设置**

    - `infrastructure/http/routes.js`
    - `infrastructure/http/middleware.js`

18. **服务器设置**
    - `infrastructure/server/server-setup.js`
    - `index.js` (应用入口)

## 重构执行计划

### 优先级和依赖关系

```
阶段 1: 基础架构定义
  ├── 核心域模型 (无依赖)
  └── 端口定义 (依赖域模型)

阶段 2: 基础设施适配器
  ├── 日志系统 (最优先，其他组件都需要)
  ├── 持久化仓储 (依赖域模型)
  └── 工具类 (UUID生成器等)

阶段 3: MCP核心功能
  ├── MCP连接器 (依赖日志)
  ├── MCP池 (依赖连接器)
  └── Instance Registry (依赖域模型)

阶段 4: 应用服务
  ├── 会话管理 (依赖仓储)
  ├── MCP管理 (依赖MCP池)
  ├── 生命周期管理 (依赖Instance Registry)
  └── 聊天管理 (依赖会话和MCP管理)

阶段 5: 外部服务
  ├── OpenAI服务 (依赖日志)
  └── 通知服务 (依赖WebSocket)

阶段 6: 入站适配器
  ├── HTTP控制器 (依赖应用服务)
  ├── WebSocket适配器 (依赖应用服务)
  └── 代理控制器 (依赖MCP池)

阶段 7: 配置与启动
  ├── 配置加载 (无依赖)
  ├── 容器组装 (依赖所有服务)
  ├── 路由设置 (依赖控制器)
  └── 服务器启动 (最后)
```

## 建议实施步骤

1. **渐进式重构**：从最底层开始，逐步向上构建
2. **保持原有测试**：每次重构后运行测试确保功能正常
3. **分支开发**：为每个模块创建分支，完成后合并
4. **文档更新**：及时更新 README 和 API 文档

### 每个模块的重构计划

对于每个模块，我将提供：

- 原始代码分析
- 六边形架构位置确定
- 接口定义
- 完整实现代码
- 单元测试示例（如需要）

我们可以从您认为最重要的模块开始，还是按照我建议的优先级顺序进行？
