# Agent Scratch 开发指南

## 项目概述

嵌入在 Scratch 编辑器中的 AI 代理。根据用户的自然语言指示自动生成 Scratch 项目。

- **前端**: React + webpack、嵌入 Scratch GUI
- **AI**: Anthropic Claude API / DeepSeek API / OpenAI API / Google Gemini API（Anthropic 以外共用 OpenAI 兼容循环。Gemini 使用 generativelanguage.googleapis.com 的 OpenAI 兼容端点）
- **试用模式**: 通过 Cloudflare Worker 代理（DeepSeek deepseek-chat）
- **部署**: GitHub Pages（`npm run build` → `build/` 目录）

## 开发环境设置

```sh
cp .env.example .env   # 设置 API 密钥
npm install
npm start              # http://localhost:8602/
```

在 `.env` 中设置 `DEV_DEEPSEEK_API_KEY`・`DEV_ANTHROPIC_API_KEY`・`DEV_OPENAI_API_KEY`・`DEV_GEMINI_API_KEY` 可以免去浏览器端的手动输入。本地生产构建不包含密钥。

## 分支・PR 规则

- **禁止直接 push 到 `main`**（分支保护规则）。必须创建 PR
- **不要擅自合并 PR**。合并需要用户审查并明确指示后进行（AI 代理只需创建 PR 到此为止）
- 不要 push 到已合并 PR 的分支。创建新分支并提交 PR
- 分支命名：使用 `feat/`、`fix/`、`refactor/` 等前缀

## 设计方针

### 用逻辑确保可靠（不依赖系统提示词）

AI 的行为如果只依赖系统提示词的指示会留下随机性。**能强制执行的就用算法（代码）强制执行**。

- 要遵守的约束条件，不靠提示词的请求而是通过验证、转换、守卫来保证。例如：
  - 菜单/字段的允许值・资产存在性检查 → 用 `block-builder` 验证并通过错误让 AI自我修正（`block-specs` 的 `values` / `dynamic`）
  - 每次的积木数量上限 → 在 `set_scripts` 中物理限制
  - 日语查询 → 用 `library-search` 自动转换为英语
  - `blocksEnabled=false` → 工具排除 + 提示词 + 处理器 ToolError 的 3 重守卫
- 提示词中只保留生成内容本身（文体、说明的构成等）无法算法化的东西。
- **避免 UI 状态的双重管理**。同一个值如果同时放在 state 和 ref / localStorage 中，会出现"显示是开但实际是关"这样的错位。确定单一真实来源（source of truth），发送时的值通过参数显式传递（不依赖 state 更新的异步性）。

## 架构

### 多语言支持 (`src/i18n.js`)

- **UI 和 AI 响应的语言跟随 Scratch 的语言（`vm.getLocale()`）**。`localeToLang()` 将日语系（`ja` / `ja-Hira`）→ `'ja'`、中文系（`zh*`）→ `'zh'`、其他 → `'en'`。判断的单一真实来源是 `vm.getLocale()`，`app.jsx` 的 `useScratchLang` 通过轮询分发 `lang`（因为 VM 不发出 locale 更改事件）。
- **修改或添加 UI 文案时，必须同时更新日英两种语言（`STRINGS.ja` 和 `STRINGS.en`，现在还有 `STRINGS.zh`）**。只添加一种会导致英语 UI 中混入日语/出现 `undefined`。`test/i18n.test.js` 验证两种语言的键集合一致，所以不要在 JSX 中硬编码日语，而是一定要通过 `STRINGS[lang]` 获取。工具进度标签（`tools.js` 的 `draftingLabel`/`summarizeToolCall`）、系统提示词（`system-prompt.js` 的 `SYSTEM_PROMPT_JA`/`SYSTEM_PROMPT_EN`/`SYSTEM_PROMPT_ZH`）、错误消息（`agent-loop.js`）同样要准备多种语言版本。
- **AI 响应语言不靠提示词请求，而是通过 `lang` 替换系统提示词本身来保证**（"用逻辑确保可靠"）。`runAgent({lang})` → `getSystemPrompt(lang)` / `getBlockOperationPrompt(blocksEnabled, lang)`。

### 代理循环 (`src/agent/agent-loop.js`)

- Anthropic 循环和 OpenAI 兼容循环（`runOpenAICompatAgent`）两种实现。DeepSeek 和 OpenAI (GPT) 共用兼容循环
- 对话历史统一以 **Anthropic 格式** 管理，传递给 OpenAI 兼容 API 时进行转换
- GPT-5 系列不支持 `max_tokens`（需使用 `max_completion_tokens`）。流式传输的 usage 获取通过 `stream_options: {include_usage: true}` 选择加入
- `blocksEnabled=false` 时：
  1. 从工具列表中排除 `set_scripts`
  2. 在系统提示词中添加禁止块操作的约束
  3. 在处理器端也抛出 `ToolError` 进行物理阻止（3 重守卫）

### 工具处理器 (`src/agent/tool-handlers.js`)

- `createToolHandlers(vm, {blocksEnabled})` — 接收 `blocksEnabled`
- `set_scripts` 中自动加载画笔扩展：`vm.extensionManager.isExtensionLoaded('pen')`（不使用 `vm.runtime._extensions` 因为它不存在）

### 积木图像显示 (`src/components/chat-panel/chat-panel.jsx`)

- 将 AI 响应中的 opcode（`looks_hide` 等）转换为 scratchblocks SVG
- 浏览器语言为 `ja` 时显示日语标签
- 日语标签通过 `src/agent/block-labels.js` 的 `JA` 对象管理
- AI 不用 opcode 而是用日语名称（「ずっと」等）编写时，也将通过引号内的字符串通过 `findOpcodeByJaName`（从 JA 标签自动生成的逆向查找 + 别名）解析为 opcode 并转换为积木图像。常见的换说法添加到 `JA_NAME_ALIASES`
- **重要**：日语标签必须与 scratchblocks 区域设置文件（`locales/ja.json`）中的字符串精确一致。包括 `@greenFlag`、`@turnRight` 等图标引用

### 系统提示词 (`src/agent/system-prompt.js`)

- 从 `BLOCK_SPECS` 动态生成 opcode 规格（为了 prompt caching 不放入易失值）
- 指示 AI 在提到积木时使用 opcode 编写（UI 会自动转换为积木图像）
- `blocksEnabled=false` 时在末尾添加禁止约束

## Cloudflare Worker（试用模式代理）

- 接受 `/v1/chat/completions` 和 `/chat/completions` 两种路径
  - OpenAI SDK 如果将 `/v1` 不带 `/v1` 传递给 `baseURL`，会向 `/chat/completions` 发送请求
- Secret: `DEEPSEEK_API_KEY`（旧：`ANTHROPIC_API_KEY`）
- 更改后需要 `cd worker && npx wrangler deploy` 重新部署

## 常见踩坑点

### React `useCallback` 的依赖数组

使用 state 的回调记得添加到依赖数组中。如果忘记添加 `blocksEnabled` 会导致切换失效。禁止为了避免依赖数组延迟而用 ref 双重持有（会与 state 错位导致 bug）。`handleSend` 将 `blocksEnabled` 加入依赖数组直接读取 state，临时禁用通过 `onSend(text, {forceBlocksDisabled})` 传递参数。

### scratchblocks 的日语区域设置

即使通过 `loadLanguages` 注册，如果文本与区域设置文件的字符串不完全一致，颜色也不会正确分配。原样使用 `ja.json` 的值，将 `%1` 替换为 `(10)` 等。

### 画笔扩展的加载 API

- 正确：`vm.extensionManager.isExtensionLoaded('pen')`
- 错误：`vm.runtime._extensions.isExtensionLoaded('pen')` → `_extensions` 不存在

### CI（GitHub Actions）

将 `actions/checkout`、`actions/setup-node`、`actions/configure-pages`、`actions/upload-pages-artifact`、`actions/deploy-pages` 保持在 Node.js 24 对应版本。

## 测试・确认方法

本地确认 UI 动作使用 Chrome 的 DevTools Protocol 很方便：

```sh
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --headless=new --disable-gpu --no-sandbox \
  --remote-debugging-port=9222 --remote-allow-origins="*" \
  "http://localhost:8602/" &
```

可以用 Python 的 websocket-client 进行页面操作和截图。但无头 Chrome 不支持 WebGL 所以 Scratch 的舞台绘制会崩溃。积木图像（scratchblocks SVG）的确认是可能的。

### 自动测试（`npm test`）

不使用重量级测试运行器（jest/vitest），统一使用 **esbuild 打包 → node 执行**方式。

- 逻辑：`test/block-builder.test.js`、`test/block-labels.test.js`、`test/static-checks.js`
- React 组件：通过 `tools/run-ui-test.mjs` 执行 `test/chat-panel-ui.test.js`（jsdom + `@testing-library/react`）。`scratchblocks`（UMD）和 CSS 对测试不需要，所以在运行器内的 esbuild plugin / 空加载器中做 stub。UI 动作（折叠等）的回归测试添加到此处。