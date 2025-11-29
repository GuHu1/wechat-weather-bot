const express = require('express');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
const TOKEN = 'weixin123';
const GITHUB_REPO = 'GuHu1/wechat-weather-bot';

app.use(express.raw({ type: 'text/xml' }));

// GET: 微信验证
app.get('/wechat', (req, res) => {
  const { signature, timestamp, nonce, echostr } = req.query;
  const tmpStr = [TOKEN, timestamp, nonce].sort().join('');
  const sha1 = crypto.createHash('sha1').update(tmpStr).digest('hex');
  sha1 === signature ? res.send(echostr) : res.status(403).send('签名错误');
});

// POST: 接收消息（增强版）
app.post('/wechat', async (req, res) => {
  try {
    const xmlData = req.body.toString();
    
    // 提取所有信息
    const msgType = xmlData.match(/<MsgType><!\[CDATA\[(.*?)\]\]><\/MsgType>/)?.[1] || 'text';
    const fromUser = xmlData.match(/<FromUserName><!\[CDATA\[(.*?)\]\]><\/FromUserName>/)?.[1] || '';
    const createTime = xmlData.match(/<CreateTime>(\d+)<\/CreateTime>/)?.[1] || '';
    
    let content = '';
    let mediaId = '';
    
    // 根据消息类型提取内容
    if (msgType === 'text') {
      // 保留表情，不过滤
      content = xmlData.match(/<Content><!\[CDATA\[(.*?)\]\]><\/Content>/)?.[1] || '';
    } else if (msgType === 'image') {
      mediaId = xmlData.match(/<MediaId><!\[CDATA\[(.*?)\]\]><\/MediaId>/)?.[1] || '';
      content = `[图片]`;
    } else if (msgType === 'emoji') {
      content = xmlData.match(/<Emoji><!\[CDATA\[(.*?)\]\]><\/Emoji>/)?.[1] || '[表情]';
    } else {
      content = `[${msgType}消息]`;
    }

    // 构建结构化数据
    const messageData = {
      timestamp: createTime,
      openid: fromUser,
      type: msgType,
      content: content,
      mediaId: mediaId  // 图片/语音的MediaId
    };

    // 触发 GitHub Actions
    await axios.post(
      `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/receive-msg.yml/dispatches`,
      {
        ref: 'main',
        inputs: {
          message_json: JSON.stringify(messageData),
          raw_xml: xmlData  // 调试用
        }
      },
      {
        headers: {
          'Authorization': `token ${process.env.GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );
    
    res.send('success');
  } catch (error) {
    console.error('处理失败:', error.message);
    res.send('success');
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`监听端口 ${PORT}`));
