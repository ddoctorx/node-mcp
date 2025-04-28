// 简单的搜索工具实现
const description = '搜索文本内容';

// 参数定义
const parameters = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description: '要搜索的查询文本',
    },
  },
  required: ['query'],
};

// 示例数据库，实际应用中可以连接真实数据库
const database = [
  { id: 1, title: 'Node.js简介', content: 'Node.js是一个基于Chrome V8引擎的JavaScript运行环境。' },
  { id: 2, title: 'Express框架', content: 'Express是一个简洁灵活的Node.js Web应用框架。' },
  { id: 3, title: 'MCP协议', content: 'MCP是Message Computation Provider的缩写，用于AI工具调用。' },
  {
    id: 4,
    title: 'JavaScript基础',
    content: 'JavaScript是一种脚本编程语言，用于创建动态网页内容。',
  },
  { id: 5, title: 'RESTful API', content: 'REST是一种软件架构风格，用于创建可扩展的Web服务。' },
  {
    id: 6,
    title: 'WebSocket技术',
    content: 'WebSocket是一种在单个TCP连接上进行全双工通信的协议。',
  },
  { id: 7, title: '前端开发', content: '前端开发涉及HTML、CSS和JavaScript等技术栈。' },
  { id: 8, title: '后端开发', content: '后端开发负责服务器端逻辑和数据处理。' },
];

async function execute(params) {
  const { query } = params;

  if (!query) {
    throw new Error('搜索查询不能为空');
  }

  // 简单搜索实现
  const results = database.filter(
    item => item.title.includes(query) || item.content.includes(query),
  );

  // 模拟API延迟
  await new Promise(resolve => setTimeout(resolve, 300));

  return {
    query,
    count: results.length,
    results,
  };
}

module.exports = {
  description,
  parameters,
  execute,
};
