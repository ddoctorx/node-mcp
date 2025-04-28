// 天气工具实现
const description = '获取城市天气信息';

// 参数定义
const parameters = {
  type: 'object',
  properties: {
    city: {
      type: 'string',
      description: '要查询天气的城市名称',
    },
  },
  required: ['city'],
};

// 模拟天气数据库，实际应用中应连接真实天气API
const weatherData = {
  北京: { temp: 22, condition: '晴朗', humidity: 45, wind: '3级' },
  上海: { temp: 26, condition: '多云', humidity: 60, wind: '2级' },
  广州: { temp: 30, condition: '阵雨', humidity: 75, wind: '1级' },
  深圳: { temp: 29, condition: '晴间多云', humidity: 70, wind: '2级' },
  杭州: { temp: 24, condition: '晴朗', humidity: 50, wind: '2级' },
  成都: { temp: 25, condition: '多云', humidity: 65, wind: '1级' },
  武汉: { temp: 27, condition: '晴朗', humidity: 55, wind: '3级' },
  西安: { temp: 23, condition: '多云', humidity: 48, wind: '4级' },
  南京: { temp: 25, condition: '晴朗', humidity: 52, wind: '2级' },
  重庆: { temp: 28, condition: '阵雨', humidity: 72, wind: '1级' },
};

async function execute(params) {
  const { city } = params;

  if (!city) {
    throw new Error('城市名不能为空');
  }

  // 获取天气信息
  const weather = weatherData[city];

  if (!weather) {
    throw new Error(`未找到城市"${city}"的天气信息`);
  }

  // 模拟API延迟
  await new Promise(resolve => setTimeout(resolve, 500));

  return {
    city,
    temperature: weather.temp,
    condition: weather.condition,
    humidity: weather.humidity,
    wind: weather.wind,
    updated: new Date().toISOString(),
    forecast: [
      {
        date: getTomorrowDate(1),
        temp: Math.round(weather.temp + (Math.random() * 4 - 2)),
        condition: getRandomCondition(),
      },
      {
        date: getTomorrowDate(2),
        temp: Math.round(weather.temp + (Math.random() * 6 - 3)),
        condition: getRandomCondition(),
      },
      {
        date: getTomorrowDate(3),
        temp: Math.round(weather.temp + (Math.random() * 8 - 4)),
        condition: getRandomCondition(),
      },
    ],
  };
}

// 辅助函数：获取未来日期
function getTomorrowDate(daysFromNow) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().split('T')[0];
}

// 辅助函数：随机天气状况
function getRandomCondition() {
  const conditions = ['晴朗', '多云', '阵雨', '晴间多云', '小雨', '阴天'];
  return conditions[Math.floor(Math.random() * conditions.length)];
}

module.exports = {
  description,
  parameters,
  execute,
};
