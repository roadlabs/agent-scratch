# VibeCat 开发指南

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

### 实施流程

- **所有非平凡的代码改动都在新分支上进行**（不直接修改 main）。实施开始前先创建并切换到目标分支（`git checkout -b <type>/<name>`），所有 commit 都在该分支上累积。
- **按逻辑阶段分多个 commit**，便于 review：例如 `feat: 核心实现` → `feat: UI 集成` → `docs: 更新 CLAUDE.md` → `test: 添加测试`。
- **AI 代理不应主动 push** 或创建 PR，除非用户明确指示（按 CLAUDE.md「分支・PR 规则」）。完成后等待用户审查。

### 测试与评价

- **完整的测试与评价 pass 应通过独立的子代理（sub-agent）执行**，不在主代理的内联流程里直接运行。这是职责分离：主代理负责实现，子代理负责独立验证（获得外部视角、避免确认偏差）。
- 适用场景：PR 前的自检、新增功能完成后的回归验证、任何需要跑完整 `npm test` + `npm run build` 的场合。
- 子代理任务应包含：(1) 运行 `npm test` + `npm run build` (2) 静态检查（`node test/static-checks.js`）(3) 代码审查（聚焦设计原则、回归风险）(4) 输出可合并 / 阻塞 / 警告的明确判定。
- 主代理仍可"快速"运行单条命令做即时确认（如 `npx esbuild --check`），但完整的测试 pass 一定要走子代理。

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

### Agent 模式：Programmer 与 Actor 两种范式

VibeCat 提供两种 agent 范式，通过 chat panel header 的「Program / Actor」芯片切换：

- **Programmer 模式（默认）**：`set_scripts` DSL 创作 Scratch 积木脚本，由用户按绿旗执行。工具集定义在 `src/agent/tools.js`，处理器在 `src/agent/tool-handlers.js`。这是 VibeCat 最初始的设计。
- **Actor 模式（Runtime Actor）**：LLM 作为运行时驱动者，通过原子动作（`actor_move` / `actor_set_position` / `actor_say` 等）连续观察 VM 状态、决策、执行。每次写入动作的 handler 强制回显 post-state（`{ok, action, target, state}`），形成 closed feedback loop。工具集定义在 `src/agent/runtime-tools.js`，处理器在 `src/agent/runtime-handlers.js`，独立的 agent 循环在 `src/agent/actor-loop.js`。

模式分发在 `runAgent` 入口：`runAgent({mode='programmer'|'actor', ...})`。两种模式共享 `apiMessagesRef`（Anthropic 格式对话历史），切换时往历史中注入一行 user-content 系统提醒（`modeSwitchToActor` / `modeSwitchToProgrammer`），避免 LLM 沿用旧模式思路。

**Actor 模式的关键设计**（遵循"用逻辑确保可靠"）：

- **写入即回显**：每个写入动作的 handler 返回 `{ok, action, target, state}`，`state` 是受影响 sprite 的 post-snapshot（位置/方向/コスチューム/吹き出し等）。LLM 不可能基于陈旧记忆决策 —— closed feedback loop 由 handler 返回值强制，而非提示词请求。
- **actor_ 前缀隔离命名空间**：与程序员模式的工具集（`set_scripts` 等）完全独立，避免碰撞。actor 工具列表里没有 `set_scripts`，强化"actor 不创作积木脚本"的边界。
- **三重防御 actor 不创作积木**：(1) 工具列表里没有 `set_scripts` (2) 系统提示词中明确禁止 (3) `actor_` 处理器只调用运行时方法（`setXY` / `say` 等），不接触 `t.blocks`。
- **资产/克隆/执行控制**共用 `createToolHandlers` 的逻辑（通过 `createToolHandlers(vm, {blocksEnabled: false})` 复用，actor 模式下 set_scripts 等被排除）。返回结果附 `state` 字段回显全目标列表，让 LLM 看到变更后的世界。
- **actor 模式强制 `blocksEnabled=false`**（即使 UI 切换了 toggle，handler 端也拒绝积木操作）。

### 多语言支持 (`src/i18n.js`)

- **UI 和 AI 响应的语言跟随 Scratch 的语言（`vm.getLocale()`）**。`localeToLang()` 将日语系（`ja` / `ja-Hira`）→ `'ja'`、中文系（`zh*`）→ `'zh'`、其他 → `'en'`。判断的单一真实来源是 `vm.getLocale()`，`app.jsx` 的 `useScratchLang` 通过轮询分发 `lang`（因为 VM 不发出 locale 更改事件）。
- **修改或添加 UI 文案时，必须同时更新日英两种语言（`STRINGS.ja` 和 `STRINGS.en`，现在还有 `STRINGS.zh`）**。只添加一种会导致英语 UI 中混入日语/出现 `undefined`。`test/i18n.test.js` 验证两种语言的键集合一致，所以不要在 JSX 中硬编码日语，而是一定要通过 `STRINGS[lang]` 获取。工具进度标签（`tools.js` 的 `draftingLabel`/`summarizeToolCall`、`runtime-tools.js` 的 `runtimeDraftingLabel`/`summarizeActorToolCall`）、系统提示词（`system-prompt.js` 的 `SYSTEM_PROMPT_JA`/`SYSTEM_PROMPT_EN`/`SYSTEM_PROMPT_ZH`、`runtime-system-prompt.js` 的 actor prompt）、错误消息（`agent-loop.js`）同样要准备多种语言版本。
- **AI 响应语言不靠提示词请求，而是通过 `lang` 替换系统提示词本身来保证**（"用逻辑确保可靠"）。`runAgent({lang})` → `getSystemPrompt(lang)` / `getBlockOperationPrompt(blocksEnabled, lang)` / `getRuntimeActorSystemPrompt(lang)`。

### scratch-gui 菜单栏翻译

`scratch-gui` 使用 `react-intl` 进行 GUI 菜单本地化，**不通过 `vm.setLocale`**。`scratch-l10n` 中部分中文翻译缺失（如 Settings、Debug 等菜单项），通过 `app.jsx` 的 DOM 操作注入补充翻译：

```javascript
useEffect(() => {
    if (lang !== 'zh') return;
    const translations = { 'Settings': '设置', 'Debug': '调试', ... };
    const applyTranslations = () => { /* DOM 查询替换 */ };
    const observer = new MutationObserver(applyTranslations);
    observer.observe(document.body, {childList: true, subtree: true});
    return () => observer.disconnect();
}, [lang]);
```

如需添加新的菜单翻译，在 `translations` 对象中添加 key-value 即可。

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

### 项目切换检测

点击"新作品"时自动清空聊天历史。通过监控 `vm.runtime.targets` 的 ID 集合变化来检测项目切换：

- 轮询 `vm.runtime.targets` 获取当前所有 sprite 的 ID
- 比较当前 ID 集合与之前的是否有重叠
- 如果没有任何重叠（即所有 ID 都变了），则判定为新项目
- 通过 `projectKey` 状态递增触发 `ChatPanel` 重新渲染并清空消息

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

### scratch-vm RenderedTarget 公开 API 的实际边界（实测，非文档假设）

很多直觉上"应该存在"的方法实际不在 RenderedTarget 上 —— 它们是 `scratch3_motion.js` / `scratch3_looks.js` / `scratch3_pen/` 等文件里的 block primitive，签名是 `(args, util)` 而非实例方法。

**实测可用的 RenderedTarget 公开方法只有 9 个**：

| 方法 | 用途 |
|---|---|
| `setXY(x, y)` | 绝对位置（`force` 参数是内部用） |
| `setDirection(d)` | 绝对方向（90=右、0=上、-90=左、180=下） |
| `setVisible(b)` | 显示/隐藏 |
| `setSize(s)` | 大小（百分比） |
| `setCostume(idx)` | costume 切换（必须传数字索引，名称查找要自己做） |
| `goToFront()` / `goToBack()` | 图层（注意不是 `goToLayer`） |
| `getCustomState(key)` / `setCustomState(key, value)` | 自定义状态存储（base 类的 `_customState[key]`） |

**❌ 不在 RenderedTarget 上的"常识方法"**：`changeX` / `changeY` / `turnRight` / `turnLeft` / `moveSteps` / `goTo` / `glideTo` / `pointTowards` / `say` / `think` / `stopSpeaking` / `sayingText` / `thinkingText` / `bubbleType` / `goToLayer` 等。**遇到这些需求，要么自己计算（用 `setXY` + `setDirection`）+ 读取 `getCustomState('Scratch.looks').text/.type`**，要么**走 block primitive 路径**（见下条）。

### Block Primitive 调用模式（绕过 event listener）

`runtime.getOpcodeFunction(opcode)` 返回**绑定到 packageObject 的函数**，可以直接调用：

```js
const fn = vm.runtime.getOpcodeFunction('looks_say');
fn({MESSAGE: text}, {target, runtime: vm.runtime});  // util 对象最少需要 target + runtime
```

这一路径比 `runtime.emit('SAY', target, type, text)` 更可靠 —— 避免 listener 绑定时机、多个 runtime 实例等边界情况。`actor_say` / `actor_think` / 所有扩展（pen / music / text2speech / translate）的 primitive 都走这条路。

### Scratch VM 角度数学

`pointTowards` 的核心算法（在 actor-loop 中用）：

```js
// 把 dx, dy 转换为 Scratch 方向（90=右、0=上、180=下）
const direction = 90 - radToDeg(Math.atan2(dy, dx));
```

注意 Scratch 的"上"是 0 度，跟一般数学的 90 度相反。`glide` 不在 RenderedTarget 上，需要自实现（用 `setInterval` 推进 `setXY`）。

### 扩展加载的时序陷阱

`vm.extensionManager.loadExtensionURL('pen')` **resolve 不等于 primitive 可用**。它只注册 service，primitive 要通过 `dispatch.call('runtime', '_registerExtensionPrimitives', ...)` **异步**注册到 `runtime._primitives`。

**正确模式**：加载后 `waitForPrimitive` 轮询 `getOpcodeFunction(opcode)` 可见：

```js
const waitForPrimitive = (vm, extId, opcode, timeoutMs = 2000) =>
    new Promise((resolve, reject) => {
        const start = Date.now();
        const check = () => {
            const fn = vm.runtime.getOpcodeFunction(opcode);
            if (fn) return resolve(fn);
            if (Date.now() - start > timeoutMs) return reject(new Error('timeout'));
            setTimeout(check, 20);
        };
        check();
    });
```

否则会出现"扩展激活了但 primitive 找不到"的诡异错误，LLM 翻译后报错信息变成"目前这个项目没有激活画笔扩展"。给 agent 暴露一个 `actor_ensure_extension` 显式等待工具，比让 agent 间接踩坑要好。

### Actor 模式的语言策略

- **System prompt** 跟随 `vm.getLocale()`（与 Programmer 模式一致）
- **LLM 回复语言**跟随**用户输入消息**的语言，不是 Scratch UI 的语言

三套语言的 system prompt 都明确这条：「**用用户输入消息使用的语言回复**」。Scratch UI 的 locale 只决定你收到哪一版 prompt，不影响回复语言；用户输入语言优先。

### Actor 工具的前缀命名空间

`actor_` 前缀（48 个 actor_ 工具）隔离了与 Programmer 模式 `set_scripts` 等工具的命名空间。两个好处：
1. 两个模式能并存且互不污染（`runAgent({mode='programmer'|'actor'})` 分发）
2. 模式切换时缓存断点（cache_control）的语义边界清晰 —— actor tools / programmer tools 分别占一个 cache 段

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