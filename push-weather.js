const axios = require('axios');

// 获取微信 Access Token
async function getAccessToken() {
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${process.env.APPID}&secret=${process.env.APPSECRET}`;
  const res = await axios.get(url);
  if (!res.data.access_token) {
    throw new Error(`获取 token 失败: ${JSON.stringify(res.data)}`);
  }
  return res.data.access_token;
}

// 获取实时天气数据
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

// 获取天气预警信息
async function getWarnings(cityId) {
  const apiKey = process.env.WEATHER_API_KEY;
  const url = `https://devapi.qweather.com/v7/warning/now?location=${cityId}&key=${apiKey}`;
  
  try {
    const res = await axios.get(url);
    if (res.data.code === '200' && res.data.warning) {
      return res.data.warning; // 返回预警数组
    }
    return []; // 无预警
  } catch (error) {
    console.warn('⚠️ 获取预警失败:', error.message);
    return []; // 失败也返回空数组，不影响主流程
  }
}

// 智能生成提示语
function generateTip(warnings) {
  const tips = [];
  
  for (const warning of warnings) {
    const title = warning.title || '';
    const lowerTitle = title.toLowerCase();
    
    // 预警关键词匹配（优先级从高到低）
    if (lowerTitle.includes('雪') || lowerTitle.includes('道路结冰')) {
      tips.push('🌨️ 降雪预警：小心路滑，注意交通安全');
    } else if (lowerTitle.includes('暴雨') || lowerTitle.includes('大雨')) {
      tips.push('☔ 暴雨预警：记得带伞，避免外出');
    } else if (lowerTitle.includes('寒潮') || lowerTitle.includes('低温')) {
      tips.push('❄️ 寒潮预警：记得穿羽绒服，注意保暖');
    } else if (lowerTitle.includes('大风')) {
      tips.push('💨 大风预警：注意多穿衣服，避免高空坠物');
    } else if (lowerTitle.includes('雾') || lowerTitle.includes('霾')) {
      tips.push('🌫️ 雾霾预警：建议戴口罩，减少户外运动');
    } else if (lowerTitle.includes('高温')) {
      tips.push('🔥 高温预警：注意防暑降温，多补水');
    } else if (lowerTitle.includes('雨')) {
      tips.push('🌦️ 降雨提示：记得带伞');
    }
  }
  
  // 去重并限制数量
  const uniqueTips = [...new Set(tips)];
  if (uniqueTips.length > 0) {
    return uniqueTips.slice(0, 2).join('\n'); // 最多显示2条
  }
  
  // 无预警时的默认提示
  return '记得带伞，注意保暖！';
}

// 发送模板消息
async function sendTemplateMessage(token, userId, weather, tip, cityName, warnings) {
  const url = `https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${token}`;
  
  // 格式化预警信息
  const warningText = warnings.length > 0 
    ? warnings.map((w, i) => `${i + 1}. ${w.title}`).join('\n') 
    : '暂无预警';
  
  const data = {
    touser: userId,
    template_id: process.env.TEMPLATE_ID,
    data: {
      date: { value: new Date().toLocaleDateString('zh-CN') },
      city: { value: cityName },
      weather: { value: weather.weather },
      temperature: { value: `${weather.temperature}°C` },
      wind: { value: weather.wind },
      warning: { value: warningText },
      tip: { value: tip }
    }
  };
  
  const res = await axios.post(url, data);
  if (res.data.errcode !== 0) {
    throw new Error(`推送失败: ${JSON.stringify(res.data)}`);
  }
  console.log(`✅ 推送成功给 ${userId}`);
}

// 主函数
async function main() {
  try {
    console.log('开始执行天气推送...\n');
    
    // 解析用户配置: OpenID:城市ID:城市名,OpenID:城市ID:城市名
    const userConfigs = process.env.USER_CONFIG.split(',').map(config => {
      const [openid, cityId, cityName] = config.split(':');
      if (!openid || !cityId || !cityName) {
        throw new Error(`USER_CONFIG 格式错误: ${config}`);
      }
      return { 
        openid: openid.trim(), 
        cityId: cityId.trim(), 
        cityName: cityName.trim() 
      };
    });
    
    console.log(`已配置 ${userConfigs.length} 个用户`);
    
    // 获取微信 token（只需一次）
    const token = await getAccessToken();
    
    // 遍历每个用户，按城市推送
    for (const userConfig of userConfigs) {
      try {
        console.log(`\n📍 ${userConfig.cityName} - ${userConfig.openid}`);
        
        // 并行获取天气和预警（加快速度）
        const [weather, warnings] = await Promise.all([
          getWeather(userConfig.cityId),
          getWarnings(userConfig.cityId)
        ]);
        
        const tip = generateTip(warnings);
        
        console.log(`  天气: ${weather.weather} ${weather.temperature}°C`);
        console.log(`  预警: ${warnings.length} 条`);
        console.log(`  提示: ${tip.replace(/\n/g, ' / ')}`);
        
        // 发送消息
        await sendTemplateMessage(token, userConfig.openid, weather, tip, userConfig.cityName, warnings);
      } catch (error) {
        console.error(`⚠️ 用户 ${userConfig.openid} 推送失败:`, error.message);
        // 继续处理下一个用户，不中断整个流程
      }
    }
    
    console.log('\n🎉 所有推送任务完成！');
  } catch (error) {
    console.error('❌ 执行失败:', error.message);
    process.exit(1);
  }
}

// 执行
main();
