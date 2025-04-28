const axios = require('axios');

// OpenAI API配置
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// 检查API密钥在启动时是否存在
if (!OPENAI_API_KEY) {
  console.error('警告: 未设置OpenAI API密钥，请设置OPENAI_API_KEY环境变量');
  console.error('当前环境变量:', {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    // 不输出实际的API密钥，仅检查是否存在
    OPENAI_API_KEY_EXISTS: !!process.env.OPENAI_API_KEY,
  });
}

// 调用OpenAI聊天API
async function callChatCompletion(messages, tools = null, toolChoice = 'auto') {
  // 再次检查API密钥，确保它在运行时可用
  const apiKey = process.env.OPENAI_API_KEY || OPENAI_API_KEY;

  if (!apiKey) {
    console.error('无法获取OpenAI API密钥，请检查.env文件和环境变量');
    throw new Error('未设置OpenAI API密钥，请设置OPENAI_API_KEY环境变量');
  }

  try {
    const requestOptions = {
      method: 'post',
      url: OPENAI_API_URL,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      data: {
        model: 'gpt-4.1',
        messages,
        temperature: 0.7,
      },
    };

    // 如果提供了工具，添加到请求中
    if (tools && tools.length > 0) {
      requestOptions.data.tools = tools;
      requestOptions.data.tool_choice = toolChoice;
    }

    // 完整打印请求参数 (不包含敏感的Authorization头)
    console.log('================ OpenAI请求开始 ================');
    console.log('请求URL:', requestOptions.url);
    console.log('请求方法:', requestOptions.method);
    console.log('请求头:', {
      'Content-Type': requestOptions.headers['Content-Type'],
      Authorization: '******', // 隐藏实际token
    });
    console.log('请求参数:');
    console.log(JSON.stringify(requestOptions.data, null, 2));
    console.log('================ OpenAI请求结束 ================');

    console.log('正在向OpenAI API发送请求...');
    const response = await axios(requestOptions);

    // 完整打印响应内容
    console.log('================ OpenAI响应开始 ================');
    console.log('响应状态码:', response.status);
    console.log('响应头:', response.headers);
    console.log('响应体:');
    console.log(JSON.stringify(response.data, null, 2));
    console.log('================ OpenAI响应结束 ================');

    return response.data;
  } catch (error) {
    console.error('OpenAI API调用失败:', error.response?.status || error.message);
    console.error('完整错误信息:', error.response?.data || error.message);

    if (error.response) {
      console.error('================ OpenAI错误响应详情 ================');
      console.error('错误状态码:', error.response.status);
      console.error('错误响应头:', error.response.headers);
      console.error('错误响应体:', JSON.stringify(error.response.data, null, 2));
      console.error('================ OpenAI错误响应结束 ================');
    }

    throw new Error(`OpenAI API调用失败: ${error.response?.data?.error?.message || error.message}`);
  }
}

// 将MCP工具转换为OpenAI工具格式
function convertMcpToolsToOpenAIFormat(mcpTools) {
  if (!mcpTools || !Array.isArray(mcpTools)) return [];

  return mcpTools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description || `执行${tool.name}操作`,
      parameters: tool.parameters || {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  }));
}

// 处理OpenAI的函数调用响应
async function handleFunctionCalling(response, sessionId, mcpSessions, callMcpTool) {
  if (!response.choices || !response.choices[0]) {
    return { type: 'text', content: '无法处理AI响应' };
  }

  const message = response.choices[0].message;

  // 记录收到的消息
  console.log('================ 处理OpenAI工具调用 ================');
  console.log('工具调用消息:');
  console.log(JSON.stringify(message, null, 2));

  // 如果有工具调用
  if (message.tool_calls && message.tool_calls.length > 0) {
    console.log('检测到函数调用:', JSON.stringify(message.tool_calls, null, 2));

    // 处理所有的工具调用
    const results = [];
    for (const toolCall of message.tool_calls) {
      if (toolCall.type === 'function') {
        const functionName = toolCall.function.name;
        let functionArgs = {};

        try {
          // 增强的参数解析逻辑
          if (toolCall.function.arguments && typeof toolCall.function.arguments === 'string') {
            // 去除可能的空白字符，确保JSON解析有效
            const trimmedArgs = toolCall.function.arguments.trim();

            if (trimmedArgs === '') {
              console.log(`函数 "${functionName}" 提供了空参数字符串，使用空对象`);
            } else if (trimmedArgs === '{}') {
              console.log(`函数 "${functionName}" 提供了空对象，使用空对象`);
            } else {
              try {
                functionArgs = JSON.parse(trimmedArgs);
                console.log(`成功解析函数 "${functionName}" 的参数:`, functionArgs);
              } catch (jsonError) {
                console.error(`解析函数 "${functionName}" 参数失败:`, jsonError);
                console.log(`尝试解析的原始参数字符串:`, trimmedArgs);
                functionArgs = {}; // 解析失败时使用空对象
              }
            }
          } else {
            console.log(`函数 "${functionName}" 没有提供有效参数，使用空对象`);
          }

          // 额外记录更多日志，帮助调试
          console.log(`函数 "${functionName}" 最终使用的参数:`, functionArgs);

          // 检查必需参数是否存在
          for (const mcpName in mcpSessions) {
            const mcpSession = mcpSessions[mcpName];
            const toolDef = mcpSession.tools.find(t => t.name === functionName);

            if (toolDef && toolDef.parameters && toolDef.parameters.required) {
              const missingParams = toolDef.parameters.required.filter(
                param => !functionArgs[param],
              );

              if (missingParams.length > 0) {
                console.warn(`函数 "${functionName}" 缺少必需参数: ${missingParams.join(', ')}`);
              }
            }
          }
        } catch (e) {
          console.error('解析函数参数失败:', e);
          console.log('原始参数字符串:', toolCall.function.arguments);
        }

        // 查找对应的MCP和工具
        let foundTool = false;
        let toolResult = null;

        // 记录可用的MCP和工具
        console.log('可用的MCP服务:');
        for (const mcpName in mcpSessions) {
          console.log(
            `- ${mcpName} 包含工具:`,
            mcpSessions[mcpName].tools.map(t => t.name),
          );
        }

        for (const mcpName in mcpSessions) {
          const mcpSession = mcpSessions[mcpName];
          const hasTool = mcpSession.tools.some(t => t.name === functionName);

          if (hasTool) {
            console.log(`在MCP "${mcpName}" 中找到工具 "${functionName}"`);
            foundTool = true;

            try {
              console.log(`准备调用MCP "${mcpName}" 的工具 "${functionName}" 参数:`, functionArgs);
              toolResult = await callMcpTool(sessionId, mcpName, functionName, functionArgs);
              console.log(`工具 "${functionName}" 调用成功:`, toolResult);
              break;
            } catch (error) {
              console.error(`工具 "${functionName}" 调用失败:`, error);
              toolResult = { error: error.message };
            }
          }
        }

        if (!foundTool) {
          console.error(`未找到工具: "${functionName}"`);
          toolResult = { error: `未找到工具: "${functionName}"` };
        }

        // 记录函数调用结果
        const resultForAI = JSON.stringify(toolResult);
        console.log(`工具 "${functionName}" 返回给AI的结果:`, resultForAI);

        results.push({
          tool_call_id: toolCall.id,
          function_name: functionName,
          result: resultForAI,
        });
      }
    }

    console.log('================ 工具调用处理结束 ================');

    return {
      type: 'function_call',
      calls: message.tool_calls,
      results: results,
    };
  }

  // 如果只是普通文本响应
  console.log('OpenAI返回普通文本响应:', message.content);
  console.log('================ OpenAI响应处理结束 ================');

  return {
    type: 'text',
    content: message.content,
  };
}

module.exports = {
  callChatCompletion,
  convertMcpToolsToOpenAIFormat,
  handleFunctionCalling,
};
