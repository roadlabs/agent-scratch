# Agent Scratch

根据自然语言指示自动组装 Scratch 积木的、内置 AI 代理的 Scratch mod。

在编辑器右侧的提示框中输入"让小猫在点击绿旗后一直向右移动"这样的日语（现在也支持中文和英语）指示，Claude 就会通过 agent 方式（tool use 循环）添加角色、组装积木、添加声音和背景，可以亲眼看到积木在编辑器上逐渐组装的过程。

![agent-scratch 演示：提示后积木自动组装](images/agent-scratch.gif)

作为 [live-scratch](https://github.com/champierre/live-scratch)（让外部 AI 代理编辑 project.json 的方式）的发展版本，将代理直接嵌入到编辑器中。

## 特点

- **未修改 Scratch 本体**: 将 [@scratch/scratch-gui](https://www.npmjs.com/package/@scratch/scratch-gui) 作为 npm 依赖使用，与代理共享同一 VM 实例的薄包装结构
- **Agent 式逐步编辑**: 通过 Claude 的 tool use 循环，每次工具调用都反映到 VM。可以亲眼看到积木逐渐组装的过程
- **简易 DSL + 本地转换**: Claude 使用不需要知道 shadow 块或 blockId 的简易 DSL 编写脚本，本地转换器（`block-builder.js`）将其精确转换为 Scratch 积木结构并进行验证
- **支持标准库**: 可以搜索并添加 Scratch 标准库中的角色、服装、声音、背景
- **无需服务器**: 纯前端结构，直接从浏览器调用 Anthropic API。API 密钥仅保存在浏览器的 localStorage 中

## 使用方法

```bash
npm install
npm start
# → 打开 http://localhost:8602
```

1. 从右侧面板的 ⚙️ 设置 Anthropic API 密钥（在 [Anthropic Console](https://console.anthropic.com/settings/keys) 获取）
2. 选择使用的模型（默认：Claude Opus 4.8，现在也支持 DeepSeek、OpenAI、Gemini）
3. 在提示框中输入想要创建的内容（支持日语、中文、英语）

### 指示示例

- 让小猫在点击绿旗后一直向右移动
- 添加一个球，让小猫碰到球时得分增加的游戏
- 以宇宙为背景制作一个射击游戏

## 使用注意事项（年龄限制等）

本工具使用 Anthropic 的 Claude API。使用时需遵守 [Anthropic 的服务条款](https://www.anthropic.com/legal/consumer-terms) 和[使用政策（Usage Policy）](https://www.anthropic.com/legal/aup)。特别注意以下事项：

- **创建 Anthropic 账户和获取 API 密钥需要年满 18 岁**。儿童无法自行获取密钥
- 儿童（未满 18 岁）使用本工具时，**请家长或老师等大人获取并管理 API 密钥，在成人监督下使用**。Anthropic 的使用政策以及[未成年人服务提供指南](https://support.claude.com/en/articles/9307344-responsible-use-of-anthropic-s-models-guidelines-for-minors) 要求在提供 AI 服务给未成年人时采取适当的安全措施（年龄验证、内容审核等）并披露"正在与 AI 对话"
- 提供试用模式（共享密钥）的运营者同样需要遵守上述政策（设置支出上限、监督使用等）
- 在教室或研讨会等场合使用时，请向参与者说明输入的内容会被发送到 Anthropic 的服务器（建议指导不要输入个人信息）

各模型的使用条件、价格、限制的最新信息请查看 [Anthropic 官方文档](https://docs.claude.com/)。

## 试用模式（共享密钥）的设置

这是为了让未输入密钥的访问者也能试用的机制。GitHub Pages 是静态网站，如果将密钥嵌入到包中，任何人都可以提取。因此采用了将密钥保密在 Cloudflare Worker 端代的代理方式。

```bash
cd worker
npx wrangler deploy                          # 首次需要登录 Cloudflare
npx wrangler secret put ANTHROPIC_API_KEY    # 建议使用有支出上限的专用密钥
```

部署时显示的 URL（例如：`https://agent-scratch-proxy.<account>.workers.dev`）在 GitHub 仓库的 **Settings → Secrets and variables → Actions → Variables** 中注册为 `TRIAL_PROXY_URL`，重新执行 Actions 后生效。

- 为了不暴露密钥，Anthropic 的密钥保存在 **Cloudflare 的 Secret** 中（注册到 GitHub 的只有公开也没问题的代理 URL）
- Worker 仅转发来自允许源（`worker/wrangler.toml` 的 `ALLOWED_ORIGINS`）的 `/v1/messages`，并限制模型和 max_tokens
- 作为滥用对策的最后一环，请使用在 [Anthropic Console](https://console.anthropic.com/settings/limits) 设置了**支出上限的密钥**

## 开发

```bash
npm test          # block-builder(DSL→积木转换)的单元测试
npm run build     # 生产构建(build/)
```

在浏览器中打开时添加 `?selftest=1`，可以在不调用 Claude 的情况下运行 VM 工具处理器的全套测试（控制台输出 `[selftest]` 日志）。

## 架构

```
src/
├── index.jsx / app.jsx       # 自定义VM生成 → <GUI vm={vm}> + 聊天面板的双栏布局
├── agent/
│   ├── agent-loop.js         # Anthropic Messages API 的手动 tool use 循环 + prompt caching
│   ├── tools.js              # 工具定义(input_schema)
│   ├── tool-handlers.js      # 各工具 → scratch-vm 的反映（带回滚）
│   ├── block-builder.js      # DSL → 运行时积木转换、验证、逆转换
│   ├── block-specs.js        # 主要 opcode 的参数规格表
│   ├── library-search.js     # 标准库搜索
│   └── system-prompt.js      # 系统提示词（opcode规格从specs自动生成）
├── components/
│   ├── chat-panel/           # 聊天UI
│   └── api-key-modal/        # API密钥・模型设置
└── containers/
    └── chat-panel.jsx        # UI 和代理循环的连接
```

### 代理的工具

| 工具 | 说明 |
|---|---|
| `get_project_state` | 以 DSL 格式获取全目标的状态 |
| `search_library` | 搜索标准库（sprite/costume/sound/backdrop） |
| `add_sprite` / `delete_sprite` / `rename_sprite` | 角色管理 |
| `add_costume` / `add_sound` / `add_backdrop` | 资产添加 |
| `set_scripts` | 以 DSL 全量替换目标脚本 |
| `set_sprite_properties` | 直接设置位置、大小、方向、显示 |
| `start_project` / `stop_project` | 运行・停止 |

## 许可证

[AGPL-3.0-only](LICENSE)

本项目依赖和打包的 [@scratch/scratch-gui](https://www.npmjs.com/package/@scratch/scratch-gui) 以及 scratch-vm 等相关包采用 AGPL-3.0-only 许可证，因此本项目也遵循相同许可证。

另外，Scratch 的名称、Logo、Scratch 猫等是 Scratch Foundation 的商标，本项目是与 Scratch Foundation 无关的非官方 mod。