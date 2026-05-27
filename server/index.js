const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '256kb' }));
// 禁用浏览器缓存，确保每次拿到最新代码
app.use((req,res,next)=>{res.set('Cache-Control','no-cache, no-store, must-revalidate');next();});

/* ============================================================
   DeepSeek API 代理 (OpenAI 兼容)
   前端调 /api/claude ，服务端转成 DeepSeek 格式
   注意：路由必须在 static 中间件之前注册
   ============================================================ */
app.post('/api/claude', async (req, res) => {
  try {
    const { system, messages: userMsgs, max_tokens } = req.body;
    const apiKey = process.env.DEEPSEEK_API_KEY;
    const baseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
    const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

    if (!apiKey) {
      return res.status(500).json({ error: '服务端未配置 DEEPSEEK_API_KEY' });
    }

    // 组装 OpenAI 格式 messages：system 提示词 + 用户消息
    const messages = [];
    if (system) {
      messages.push({ role: 'system', content: system });
    }
    messages.push(...(userMsgs || [{ role: 'user', content: '（空）' }]));

    const resp = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        max_tokens: max_tokens || 600,
        temperature: 0.7,
        messages
      })
    });

    const data = await resp.json();
    if (data.error || !data.choices) {
      return res.status(resp.status).json({
        error: data.error?.message || JSON.stringify(data)
      });
    }

    const text = data.choices[0]?.message?.content || '';
    res.json({ text: text.trim() });
  } catch (err) {
    console.error('[DeepSeek proxy error]', err);
    res.status(500).json({ error: err.message });
  }
});

/* ============================================================
   剧本接口 —— 前后端分离，支持多副本
   ============================================================ */
const fs = require('fs');
function loadDungeonData(id) {
  const fileMap = {
    'snowbound_manor': 'snowbound_manor.json',
    'lantern_ashes': 'lantern_ashes.json'
  };
  const filename = fileMap[id] || 'snowbound_manor.json';
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', filename), 'utf-8'));
}

app.get('/api/dungeon', (req, res) => {
  const id = req.query.id || 'snowbound_manor';
  res.json(loadDungeonData(id));
});

/* ============================================================
   前端静态资源 & HTML
   ============================================================ */
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir, { etag: false, lastModified: false }));
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  next();
});

app.listen(PORT, () => {
  console.log(`异世旅社 · 服务端已启动  http://localhost:${PORT}`);
  if (!process.env.DEEPSEEK_API_KEY) {
    console.warn('⚠ 未检测到 DEEPSEEK_API_KEY，请复制 .env.example 为 .env 并填入 Key');
  }
});
