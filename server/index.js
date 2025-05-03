// src/index.js

require('dotenv').config();
const serverSetup = require('./infrastructure/server/server-setup');

/**
 * 应用程序入口
 */
async function bootstrap() {
  try {
    console.log('启动应用程序...');

    // 验证关键环境变量
    validateEnvironment();

    // 启动服务器
    await serverSetup.start();

    console.log(`应用程序成功启动，环境: ${process.env.NODE_ENV || 'development'}`);
    console.log(`前端访问地址: http://localhost:${process.env.PORT || 3000}`);
    console.log(`API地址: http://localhost:${process.env.PORT || 3000}/api`);
    console.log('使用 Ctrl+C 关闭应用程序');
  } catch (error) {
    console.error('应用程序启动失败:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

/**
 * 验证关键环境变量
 */
function validateEnvironment() {
  const requiredVars = {
    OPENAI_API_KEY: '未设置OpenAI API密钥，聊天功能将无法使用',
  };

  const warnings = [];

  Object.entries(requiredVars).forEach(([key, warning]) => {
    if (!process.env[key]) {
      warnings.push(`警告: ${warning}`);
    }
  });

  if (warnings.length > 0) {
    console.log('\n环境配置警告:');
    warnings.forEach(warning => console.log(`- ${warning}`));
    console.log('');
  }
}

/**
 * 启动应用
 */
bootstrap();
