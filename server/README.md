# AI 食物识别服务 · 部署说明

`worker.js` 是一个 Cloudflare Worker（免费额度足够个人使用：10 万请求/天）。
它的唯一职责：**帮你保管视觉大模型的 Key，并把图片转发给模型**。

## 为什么需要它

| 方案 | Key 暴露风险 | 说明 |
|---|---|---|
| 直连（App 内填 Key） | 高 | Key 存在浏览器里；若你二次分发了这个页面，Key 会跟着走 |
| **自建代理（推荐）** | 低 | Key 只存在 Cloudflare，前端只持有一个可随时更换的访问口令 |

另外：智谱 / OpenAI 等接口一般**不允许浏览器跨域直连**，代理层顺手解决了 CORS。

## 十分钟部署步骤

1. **领模型 Key**
   - 推荐智谱（视觉模型 `glm-4v-flash` **永久免费**、大陆直连、OpenAI 兼容）：
     https://open.bigmodel.cn/usercenter/proj-mgmt/apikeys
   - 或 OpenAI / 任意 OpenAI 兼容服务。

2. **建 Worker**
   - 注册 https://workers.cloudflare.com → Workers & Pages → Create Worker → 随便起个名字 → Deploy。
   - 进入 Worker → **Quick edit** → 把 `worker.js` 全文粘贴进去 → **Save and Deploy**。

3. **配置环境变量**（Settings → Variables and Secrets → Add）
   | 变量 | 值 | 必填 |
   |---|---|---|
   | `ACCESS_TOKEN` | 你自己想一个口令，例如 `boji-8f3a92` | ✅ |
   | `PROVIDER` | `zhipu`（默认）/ `openai` / `custom` | ✅ |
   | `ZHIPU_KEY` | 智谱 API Key（PROVIDER=zhipu 时） | ✅ |
   | `OPENAI_KEY` | OpenAI Key（PROVIDER=openai 时） | 视 provider |
   | `CUSTOM_KEY` + `OPENAI_BASE` | 自建/其他兼容服务 | 视 provider |

4. **在 App 里填**
   「我的」→ AI 食物识别 → 模式选「自建代理」
   - 服务地址：`https://<你的worker子域>.workers.dev/recognize`
   - 访问凭据：第 3 步的 `ACCESS_TOKEN`
   - 模型：`glm-4v-flash`
   点「保存并测试」，看到 ✅ 即通。

## 接口约定

```
POST /recognize
Content-Type: application/json
{ "token": "<ACCESS_TOKEN>", "image": "<base64 JPEG，不含 data: 前缀>", "model": "glm-4v-flash" }

200 { "ok": true,  "data": { "name":"番茄炒蛋","grams":250,"kcal":330,"protein":18,"carb":12,"fat":22,"confidence":0.8,"uncertain":false } }
401 { "ok": false, "error": "访问口令不正确" }
502 { "ok": false, "error": "调用模型失败：..." }
```

## 隐私与成本

- Worker **不落盘**：图片只在内存里过一遍，请求结束即丢弃，没有日志留存。
- 图片会被发送到你选择的模型厂商（这是 AI 识别的前提）。介意的话保持「关闭」，App 仍可用条码/在线库/历史/本地匹配。
- 免费额度用完后模型商会报错，App 会显示失败并自动降级，不会扣费、不会卡死。

## 本地自测（可选）

```bash
curl -X POST https://<你的worker>.workers.dev/recognize \
  -H "Content-Type: application/json" \
  -d '{"token":"你的口令","image":"<一张小图的base64>","model":"glm-4v-flash"}'
```
