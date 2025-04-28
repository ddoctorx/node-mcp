/**
 * SSE MCP服务器示例
 *
 * 这个示例演示了如何创建一个兼容node-mcp的SSE MCP服务器
 * 要运行此示例，请执行:
 *
 * node examples/sse-mcp-server.js
 *
 * 然后在MCP管理页面添加SSE类型的MCP，URL使用: http://localhost:3100
 */

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const PORT = process.env.SSE_PORT || 3100;

// 中间件
app.use(cors());
app.use(bodyParser.json());

// 定义可用的工具
const tools = [
  {
    name: 'weather',
    description: '获取指定城市的天气信息',
    parameters: {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          description: '城市名称，例如: 北京、上海、广州',
        },
      },
      required: ['city'],
    },
  },
  {
    name: 'calculator',
    description: '执行简单的数学计算',
    parameters: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: '要计算的数学表达式，例如: 2+2*3',
        },
      },
      required: ['expression'],
    },
  },
];

// 工具实现
const toolImplementations = {
  weather: async params => {
    const { city } = params;

    if (!city) {
      return {
        error: '缺少城市参数',
      };
    }

    // 模拟API调用，实际应用中应调用真实天气API
    const weatherData = {
      city,
      temperature: Math.round(10 + Math.random() * 20),
      condition: ['晴朗', '多云', '小雨', '大雨'][Math.floor(Math.random() * 4)],
      humidity: Math.round(40 + Math.random() * 40),
      windSpeed: Math.round(5 + Math.random() * 20),
      time: new Date().toISOString(),
    };

    return weatherData;
  },

  calculator: async params => {
    const { expression } = params;

    if (!expression) {
      return {
        error: '缺少表达式参数',
      };
    }

    try {
      // 注意: 生产环境中应避免使用eval，这里仅作为演示
      // eslint-disable-next-line no-eval
      const result = eval(expression);

      return {
        expression,
        result,
        time: new Date().toISOString(),
      };
    } catch (error) {
      return {
        error: '计算表达式失败',
        message: error.message,
        expression,
      };
    }
  },
};

// 路由
// 健康检查接口
app.get('/ping', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 获取工具列表接口
app.get('/tools', (req, res) => {
  res.json({ tools });
});

// 工具调用接口
app.post('/call', async (req, res) => {
  const { id, tool, params } = req.body;

  console.log(`收到工具调用请求: ${id}`, { tool, params });

  if (!id || !tool) {
    return res.status(400).json({
      error: '缺少必要参数',
      message: '请求必须包含id和tool字段',
    });
  }

  const toolImplementation = toolImplementations[tool];

  if (!toolImplementation) {
    return res.status(404).json({
      error: '工具不存在',
      message: `找不到名为 ${tool} 的工具`,
    });
  }

  try {
    const result = await toolImplementation(params || {});

    // 如果工具返回了错误，保持状态码200但在响应中包含错误信息
    if (result && result.error) {
      return res.json({
        id,
        error: result.error,
        message: result.message || result.error,
      });
    }

    // 返回成功结果
    res.json({
      id,
      result,
    });
  } catch (error) {
    console.error(`执行工具 ${tool} 时出错:`, error);

    res.status(500).json({
      id,
      error: '工具执行失败',
      message: error.message,
    });
  }
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`SSE MCP服务器已启动，监听端口: ${PORT}`);
  console.log(`可以通过以下URL连接到此MCP服务器:`);
  console.log(`http://localhost:${PORT}`);
  console.log(`可用工具: ${tools.map(t => t.name).join(', ')}`);
});
