const axios = require('axios');

async function getAccessToken() {
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${process.env.APPID}&secret=${process.env.APPSECRET}`;
  const res = await axios.get(url);
  if (!res.data.access_token) {
    throw new Error(`获取 token 失败: ${JSON.stringify(res.data)}`);
  }
  return res.data.access_token;
}

async function getWeather(cityId) {
  const apiKey = process.env.WEATHER_API_KEY;
  const url = `https://devapi.qweather.com/v7/weather/now?location=${cityId}&key=${apiKey}`;
  const res = await axios.get(url);
  if (res.data.code !== '200') {
    throw new Error(`天气 API 错误: ${res.data.code}`);
  }
  return {
    weather: res.data.now.text,
    temperature: res.data.now.temp,
    wind: res.data.now.windDir + res.data.now.windScale + '级'
  };
}

async function getWarnings(cityId) {
  const apiKey = process.env.WEATHER_API_KEY;
  const url = `https://devapi.qweather.com/v7/warning/now?location=${cityId}&key=${apiKey}`;
  try {
    const res = await axios.get(url);
    if (res.data.code === '200' && res.data.warning) {
      return res.data.warning;
    }
    return [];
  } catch (error) {
    console.warn('预警获取失败:', error.message);
    return [];
  }
}

async function getDailyMessage() {
  // 获取北京时间的日期字符串（格式：YYYY-MM-DD）
  function getBeijingDateString(date) {
    return date.toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).split('/').join('-'); // 转换为 YYYY-MM-DD 格式
  }

  // 计算两个日期之间的天数差（基于北京时间）
  function getDaysDiff Beijing(startDateStr, endDateStr) {
    const start = new Date(startDateStr + 'T00:00:00+08:00');
    const end = new Date(endDateStr + 'T00:00:00+08:00');
    const diffTime = end - start;
    return Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
  }

  const startDateStr = '2025-09-25';
  const todayStr = getBeijingDateString(new Date());
  const diffDays = getDaysDiffBeijing(startDateStr, todayStr);
  
  return `今天是我们重新相识的第${diffDays}天`;
}

function generateTip(warnings, temperature) {
  const tips = [];
  for (const warning of warnings) {
    const title = warning.title || '';
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes('雪') || lowerTitle.includes('道路结冰')) {
      tips.push('降雪预警：小心路滑，注意交通安全');
    } else if (lowerTitle.includes('暴雨') || lowerTitle.includes('大雨')) {
      tips.push('暴雨预警：记得带伞，避免外出');
    } else if (lowerTitle.includes('寒潮') || lowerTitle.includes('低温')) {
      tips.push('寒潮预警：记得穿羽绒服，注意保暖');
    } else if (lowerTitle.includes('大风')) {
      tips.push('大风预警：注意多穿衣服，避免高空坠物');
    } else if (lowerTitle.includes('雾') || lowerTitle.includes('霾')) {
      tips.push('雾霾预警：建议戴口罩，减少户外运动');
    } else if (lowerTitle.includes('高温')) {
      tips.push('高温预警：注意防暑降温，多补水');
    } else if (lowerTitle.includes('雨')) {
      tips.push('降雨提示：记得带伞');
    }
  }
  const uniqueTips = [...new Set(tips)];
  if (uniqueTips.length > 0) {
    return uniqueTips.slice(0, 2).join('\n');
  }
  
  // 基于温度的默认提示
  const temp = parseInt(temperature);
  if (temp > 30) {
    return '小心紫外线，做好防晒';
  } else if (temp < 10) {
    return '做好保暖';
  } else {
    return '温度很舒适，享受美好的一天';
  }
}

async function sendTemplateMessage(token, userId, weather, dailyMessage, tip, cityName, warnings) {
  const url = `https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${token}`;
  
  // 提取预警关键词
  function extractWarningKeyword(title) {
    const keywordMap = {
    '台风': '台风预警',
    '暴雨': '暴雨预警',
    '暴雪': '暴雪预警',
    '寒潮': '寒潮预警',
    '低温': '低温预警',
    '高温': '高温预警',
    '霜冻': '霜冻预警',
    '大风': '大风预警',
    '雷雨大风': '雷雨大风预警',
    '沙尘暴': '沙尘暴预警',
    '大雨': '大雨预警',
    '中雨': '中雨预警',
    '小雨': '小雨预警',
    '冰雹': '冰雹预警',
    '雷电': '雷电预警',
    '霾': '雾霾预警',
    '大雾': '大雾预警',
    '浓雾': '浓雾预警',
    '道路结冰': '道路结冰预警',
    '干旱': '干旱预警',
    '森林火险': '森林火险预警',
    '森林草原火险': '森林火险预警',
    '雷暴': '雷暴预警',
    '沙尘暴': '沙尘暴预警',
    '扬沙': '沙尘预警',
    '浮尘': '沙尘预警',
    };
    
    // 遍历关键词，匹配则返回简短版本
    for (const [key, value] of Object.entries(keywordMap)) {
      if (title.includes(key)) {
        return value;
      }
    }
    return '暂无预警信息';
  }
  
  // 使用提取后的简短预警信息
  const warningText = warnings.length > 0 
    ? warnings.map((w) => extractWarningKeyword(w.title)).join('  ') 
    : '暂无预警信息';
  
  const currentDate = new Date().toLocaleDateString('zh-CN', { 
    timeZone: 'Asia/Shanghai' 
  });
  
  const data = {
    touser: userId,
    template_id: process.env.TEMPLATE_ID,
    data: {
      date: { value: currentDate },
      city: { value: cityName },
      weather: { value: weather.weather },
      temperature: { value: `${weather.temperature}°C` },
      wind: { value: weather.wind },
      warning: { value: warningText },  // 现在这里是简短版本
      message: { value: dailyMessage },
      tip: { value: tip }
    }
  };
  
  const res = await axios.post(url, data);
  if (res.data.errcode !== 0) {
    throw new Error(`推送失败: ${JSON.stringify(res.data)}`);
  }
  console.log(`推送成功给 ${userId}`);
}

async function main() {
  try {
    console.log('开始执行天气推送...\n');
    const userConfigs = process.env.USER_CONFIG.split(',').map(config => {
      const [openid, cityId, cityName] = config.split(':');
      if (!openid || !cityId || !cityName) {
        throw new Error(`格式错误: ${config}`);
      }
      return { openid: openid.trim(), cityId: cityId.trim(), cityName: cityName.trim() };
    });
    console.log(`已配置 ${userConfigs.length} 个用户\n`);
    
    const [token, dailyMessage] = await Promise.all([
      getAccessToken(),
      getDailyMessage()
    ]);
    console.log(`今日寄语: ${dailyMessage}\n`);

    for (const userConfig of userConfigs) {
      try {
        console.log(`${userConfig.cityName} - ${userConfig.openid}`);
        const [weather, warnings] = await Promise.all([
          getWeather(userConfig.cityId),
          getWarnings(userConfig.cityId)
        ]);
        const tip = generateTip(warnings, weather.temperature);
        console.log(`  天气: ${weather.weather} ${weather.temperature}°C`);
        console.log(`  预警: ${warnings.length} 条`);
        await sendTemplateMessage(token, userConfig.openid, weather, dailyMessage, tip, userConfig.cityName, warnings);
      } catch (error) {
        console.error(`用户失败:`, error.message);
      }
    }
    console.log('\n所有推送完成！');
  } catch (error) {
    console.error('执行失败:', error.message);
    process.exit(1);
  }
}

main();
