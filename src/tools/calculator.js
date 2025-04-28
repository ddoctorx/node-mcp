// 计算器工具实现
const description = '执行数学计算';

// 参数定义
const parameters = {
  type: 'object',
  properties: {
    expression: {
      type: 'string',
      description: "要计算的数学表达式，例如 '2 + 2'",
    },
  },
  required: ['expression'],
};

async function execute(params) {
  const { expression } = params;

  if (!expression) {
    throw new Error('表达式不能为空');
  }

  try {
    // 注意：在生产环境中使用eval是不安全的，这里仅作为示例
    // 实际应用应该使用安全的数学表达式计算库
    const sanitizedExpression = sanitizeExpression(expression);
    const result = eval(sanitizedExpression);

    // 模拟API延迟
    await new Promise(resolve => setTimeout(resolve, 200));

    return {
      expression,
      result,
      sanitizedExpression,
    };
  } catch (error) {
    throw new Error(`计算错误: ${error.message}`);
  }
}

// 表达式净化，仅允许基本数学运算
function sanitizeExpression(expr) {
  // 移除所有非数字、运算符和括号的字符
  const sanitized = expr.replace(/[^0-9+\-*/().]/g, '');
  // 检查是否包含危险函数调用
  if (/\b(function|eval|setTimeout|setInterval)\b/.test(expr)) {
    throw new Error('表达式包含不允许的函数');
  }
  return sanitized;
}

module.exports = {
  description,
  parameters,
  execute,
};
