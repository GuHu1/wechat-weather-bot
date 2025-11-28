const crypto = require('crypto');
const axios = require('axios');

const TOKEN = 'weixin123';  // 必须与测试号后台一致
const GITHUB_REPO = 'GuHu1/wechat-weather-bot';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// 验证签名
function checkSignature(signature, timestamp, nonce) {
  const tmpStr = [TOKEN, timestamp, nonce].sort().join('');
  return crypto.createHash('sha1').update(tmpStr).digest('hex') === signature;
}

// 启动简单服务器
const express = require('express');
const app = express();

app.use(express.raw({ type: 'text/xml' }));

app.get('/wechat', (req, res) => {
  const { signature, timestamp, nonce, echostr } = req.query;
  if (checkSignature(signature, timestamp, nonce)) {
    res.send(echostr);  // 验证通过
  } else {
    res.status(403).send('失败');
  }
});

app.post('/wechat', async (req, res) => {
  const xml = req.body.toString();
  
  // 提取纯文字（自动过滤表情）
  const content = xml.match(/<Content><!\[CDATA\[(.*?)\]\]><\/Content>/)?.[1] || '';
  const fromUser = xml.match(/<FromUserName><!\[CDATA\[(.*?)\]\]><\/FromUserName>/)?.[1] || '';
  
  // 只存文字
  const textOnly = content.replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, '');
  
  // 触发GitHub Actions
  await axios.post(
    `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/receive-msg.yml/dispatches`,
    {
      ref: 'main',
      inputs: { content: textOnly, from_user: fromUser }
    },
    {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    }
  );
  
  res.send('success');
});

app.listen(8080, () => console.log('监听8080端口'));
