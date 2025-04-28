// 工具注册和处理中心
const searchTool = require('./search');
const calculatorTool = require('./calculator');
const weatherTool = require('./weather');

// 注册所有工具
const tools = {
  search: searchTool,
  calculator: calculatorTool,
  weather: weatherTool,
};

// 获取所有工具定义
function getToolDefinitions() {
  return Object.keys(tools).map(name => ({
    name,
    description: tools[name].description,
    parameters: tools[name].parameters || {
      type: 'object',
      properties: {},
      required: [],
    },
  }));
}

// 执行工具调用
async function executeToolCall(toolName, params) {
  if (!tools[toolName]) {
    throw new Error(`未知的工具: ${toolName}`);
  }

  try {
    const result = await tools[toolName].execute(params);
    return {
      success: true,
      result,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

module.exports = {
  getToolDefinitions,
  executeToolCall,
};
