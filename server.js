const express = require('express');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
const TOKEN = 'weixin123';
const GITHUB_REPO = 'GuHu1/wechat-weather-bot';

// 缓存 AccessToken
let cachedToken = null;
let tokenExpireTime = 0;

// 获取微信 AccessToken
async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpireTime) {
    return cachedToken;
  }
  
  const appId = process.env.APPID;
  const appSecret = process.env.APPSECRET;
  
  if (!appId || !appSecret) {
    throw new Error('环境变量 APPID 或 APPSECRET 未设置');
  }
  
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`;
  const res = await axios.get(url, { timeout: 10000 });
  
  if (res.data.access_token) {
    cachedToken = res.data.access_token;
    tokenExpireTime = now + (res.data.expires_in - 300) * 1000;
    return cachedToken;
  }
  throw new Error(`获取Token失败: ${JSON.stringify(res.data)}`);
}

app.use(express.raw({ type: 'text/xml' }));

// GET: 微信验证
app.get('/wechat', (req, res) => {
  const { signature, timestamp, nonce, echostr } = req.query;
  const tmpStr = [TOKEN, timestamp, nonce].sort().join('');
  const sha1 = crypto.createHash('sha1').update(tmpStr).digest('hex');
  sha1 === signature ? res.send(echostr) : res.status(403).send('签名错误');
});

// POST: 接收消息（修复表情识别）
app.post('/wechat', async (req, res) => {
  try {
    const xmlData = req.body.toString();
    
    const msgType = xmlData.match(/<MsgType><!\[CDATA\[(.*?)\]\]><\/MsgType>/)?.[1] || 'text';
    const fromUser = xmlData.match(/<FromUserName><!\[CDATA\[(.*?)\]\]><\/FromUserName>/)?.[1] || '';
    const createTime = xmlData.match(/<CreateTime>(\d+)<\/CreateTime>/)?.[1] || '';
    
    let content = '';
    let mediaId = '';
    
    switch (msgType) {
      case 'text':
        // Unicode Emoji 也包含在此
        content = xmlData.match(/<Content><!\[CDATA\[(.*?)\]\]><\/Content>/)?.[1] || '';
        break;
        
      case 'image':
        mediaId = xmlData.match(/<MediaId><!\[CDATA\[(.*?)\]\]><\/MediaId>/)?.[1] || '';
        const picUrl = xmlData.match(/<PicUrl><!\[CDATA\[(.*?)\]\]><\/PicUrl>/)?.[1] || '';
        
        // 判断是否为自定义表情（根据URL特征）
        const isEmoji = picUrl && (picUrl.includes('mmbiz.qlogo.cn') || picUrl.includes('mmbiz.qpic.cn'));
        content = isEmoji ? `[表情]` : `[图片]`;
        break;
        
      case 'voice':
        mediaId = xmlData.match(/<MediaId><!\[CDATA\[(.*?)\]\]><\/MediaId>/)?.[1] || '';
        content = `[语音]`;
        break;
        
      case 'video':
        mediaId = xmlData.match(/<MediaId><!\[CDATA\[(.*?)\]\]><\/MediaId>/)?.[1] || '';
        content = `[视频]`;
        break;
        
      default:
        content = `[${msgType}消息]`;
    }

    const messageData = {
      timestamp: createTime,
      openid: fromUser,
      type: msgType,
      content: content,
      mediaId: mediaId
    };

    // 触发 GitHub Actions
    await axios.post(
      `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/receive-msg.yml/dispatches`,
      {
        ref: 'main',
        inputs: {
          message_json: JSON.stringify(messageData)
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

// GET: 下载媒体文件
app.get('/download/:mediaId', async (req, res) => {
  try {
    const mediaId = req.params.mediaId;
    const token = await getAccessToken();
    const downloadUrl = `https://api.weixin.qq.com/cgi-bin/media/get?access_token=${token}&media_id=${mediaId}`;
    res.redirect(downloadUrl);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`监听端口 ${PORT}`));
