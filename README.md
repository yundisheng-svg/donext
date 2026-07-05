# DoNext — AI 驱动的极简任务管理

**用一句话描述你要做的事，AI 帮你拆成可执行的任务清单。**

DoNext 是我基于开源项目 [tududi](https://github.com/chrisvel/tududi)（MIT License）二次开发的极简任务管理应用。我把原本功能繁多的界面重构为两个核心视图 —— **All Tasks 任务总表** 和 **Notes 笔记**，并接入大模型实现 **自然语言拆分任务**。

> 🔗 **在线 Demo**：（部署后填写）— 登录页有演示账号，点击即可体验
>
> English: DoNext is a minimalist, AI-powered task manager. Type what you need to do in natural language and the LLM breaks it down into structured, actionable tasks. Built on top of the open-source project tududi (MIT).

## ✨ 核心功能

- **AI 任务拆分**：输入自然语言（如"下周三前完成产品发布准备"），调用 DeepSeek API 自动拆解为带优先级、截止日期的结构化子任务并直接入库
- **All Tasks 任务总表**：跨项目统一表格视图，支持排序、筛选、状态切换，替代原有的多层级导航
- **Notes 笔记**：轻量笔记，与任务并列的第二视图
- **多设备可用**：响应式 Web 应用，桌面 / 手机浏览器均可使用
- **多用户与鉴权**：会话登录、可选注册、演示模式（`DEMO_MODE=true` 时登录页展示演示账号）

## 🔨 我做了什么（vs. 上游）

| 模块 | 改动 |
|---|---|
| `backend/modules/ai-tasks/` | **新增**：AI 任务拆分模块 —— DeepSeek 接入、提示词规则（`TASK_SPLIT_RULES.md`）、解析与建任务服务、REST 路由 |
| `backend/models/ai_input_log.js` + migration | **新增**：AI 输入审计日志表，记录每次调用与产出任务数 |
| AI 每日限流 | **新增**：基于审计日志的全局每日调用上限（`AI_DAILY_LIMIT`），保护 demo 环境的 API 预算 |
| `frontend/components/AllTasks.tsx` | **新增**：统一任务表格页 |
| 导航 / 信息架构 | **重构**：砍掉多余页面，聚焦 All Tasks + Notes 双视图 |
| 演示模式 | **新增**：`DEMO_MODE` 配置 + 登录页一键填充演示账号 |

上游项目提供了任务/项目数据模型、鉴权、i18n 等基础设施；完整的上游说明见 [docs/UPSTREAM_README.md](docs/UPSTREAM_README.md)。

## 🧱 技术栈

- **前端**：React 18 + TypeScript + Tailwind CSS（Webpack 构建）
- **后端**：Node.js + Express + Sequelize（SQLite，可平滑切换 Postgres）
- **AI**：DeepSeek Chat API（OpenAI 兼容 SDK）
- **部署**：Docker（单容器，前后端同源）+ Zeabur

## 🚀 本地运行

```bash
npm install
npm run db:init
# 配置环境变量（见下），然后：
npm start          # 前端 dev server + 后端
```

### 环境变量

| 变量 | 说明 |
|---|---|
| `DEEPSEEK_API_KEY` | DeepSeek API Key（AI 拆分功能必需） |
| `TUDUDI_USER_EMAIL` / `TUDUDI_USER_PASSWORD` | 启动时自动创建的账号 |
| `DEMO_MODE` | `true` 时登录页展示上述账号供访客体验 |
| `AI_DAILY_LIMIT` | AI 接口全局每日调用上限（默认 100） |
| `TUDUDI_SESSION_SECRET` | 会话密钥（生产必填） |

### Docker

```bash
docker build -t donext .
docker run -p 3002:3002 \
  -e TUDUDI_SESSION_SECRET=$(openssl rand -hex 64) \
  -e TUDUDI_USER_EMAIL=demo@example.com \
  -e TUDUDI_USER_PASSWORD=demo1234 \
  -e DEMO_MODE=true \
  -e DEEPSEEK_API_KEY=sk-... \
  -v ./db:/app/backend/db \
  donext
```

## 📄 License & 致谢

MIT。基于 [chrisvel/tududi](https://github.com/chrisvel/tududi) 二次开发，保留其 MIT 版权声明（见 [LICENSE](LICENSE)）。感谢上游作者们的出色工作。
