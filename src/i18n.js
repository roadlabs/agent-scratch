// UI 文案的统一管理和语言判定辅助函数。
//
// 单一真实来源是 Scratch 的语言(vm.getLocale())。日语系(ja / ja-Hira)映射为
// 'ja'，其他全部映射为 'en'。不在 state/ref 中双重管理，显示和发送时
// 通过参数显式传递此 lang（遵循 CLAUDE.md 的设计方针）。

// Scratch 的 locale 代码('ja' / 'ja-Hira' / 'en' / 'fr' / 'zh' …) → 'ja' | 'en' | 'zh'
export const localeToLang = locale => {
    const l = String(locale || '');
    if (l.startsWith('ja')) return 'ja';
    if (l.startsWith('zh')) return 'zh';
    return 'en';
};

export const STRINGS = {
    ja: {
        // 聊天面板
        headerTitle: 'AI アシスタント',
        openAssistant: 'AI アシスタントを開く',
        closeAssistant: 'AI アシスタントを閉じる',
        settings: 'APIキー設定',
        placeholderLine1: '作りたいものを日本語で指示してください。',
        placeholderExample: '例:「ネコが旗をクリックしたら右に動き続けるようにして」',
        inputPlaceholder: '指示を入力...',
        send: '送信',
        stop: '■ 停止',
        thinking: '考え中...',
        toggleBlocks: 'ブロック操作',
        toggleDisabledTitle: 'お試しモードではブロック操作は使えません。⚙️ から自分の API キーを設定すると使えます',
        toolCopy: 'コピー',
        toolCopied: 'コピーしました ✓',
        toolErrorTitle: 'クリックでエラー内容を表示',
        trialBanner: '🎁 お試しモードで利用中(DeepSeek V3・制限あり)。⚙️ から自分の API キーを設定できます',
        noKey: '⚙️ をクリックして API キーを設定してください',
        // 容器的错误提示
        vmNotReady: 'Scratch エディタの読み込みが完了していません。',
        authInvalid: 'APIキーが無効です。設定し直してください。',
        stopped: '(停止しました)',
        // API 密钥 / 模型设置弹窗
        modalTitle: 'API キー / モデル設定',
        modalModelLabel: '使用モデル',
        modalCancel: 'キャンセル',
        modalSave: '保存',
        keyStoredNote: 'キーはこのブラウザの localStorage にのみ保存されます。',
        anthropicDesc: 'Claude を利用するための Anthropic API キーを入力してください。',
        deepseekDesc: 'DeepSeek API キーを入力してください。',
        openaiDesc: 'OpenAI API キーを入力してください。',
        geminiDesc: 'Google Gemini API キーを入力してください。',
        hintPrefix: 'API キーは ',
        hintSuffix: ' で取得できます。'
    },
    en: {
        // Chat panel
        headerTitle: 'AI Assistant',
        openAssistant: 'Open AI assistant',
        closeAssistant: 'Close AI assistant',
        settings: 'API key settings',
        placeholderLine1: 'Tell me in English what you want to make.',
        placeholderExample: 'e.g. "Make the cat move right when the green flag is clicked"',
        inputPlaceholder: 'Type your instruction...',
        send: 'Send',
        stop: '■ Stop',
        thinking: 'Thinking...',
        toggleBlocks: 'Block editing',
        toggleDisabledTitle: 'Block editing is not available in trial mode. Set your own API key from ⚙️ to enable it',
        toolCopy: 'Copy',
        toolCopied: 'Copied ✓',
        toolErrorTitle: 'Click to show the error details',
        trialBanner: '🎁 Using trial mode (DeepSeek V3, with limits). You can set your own API key from ⚙️',
        noKey: 'Click ⚙️ to set your API key',
        // Container error messages
        vmNotReady: 'The Scratch editor has not finished loading yet.',
        authInvalid: 'The API key is invalid. Please set it again.',
        stopped: '(Stopped)',
        // API key / model settings modal
        modalTitle: 'API Key / Model Settings',
        modalModelLabel: 'Model',
        modalCancel: 'Cancel',
        modalSave: 'Save',
        keyStoredNote: 'The key is stored only in this browser\'s localStorage.',
        anthropicDesc: 'Enter your Anthropic API key to use Claude.',
        deepseekDesc: 'Enter your DeepSeek API key.',
        openaiDesc: 'Enter your OpenAI API key.',
        geminiDesc: 'Enter your Google Gemini API key.',
        hintPrefix: 'You can get an API key at ',
        hintSuffix: '.'
    },
    zh: {
        // 聊天面板
        headerTitle: 'AI 助手',
        openAssistant: '打开 AI 助手',
        closeAssistant: '关闭 AI 助手',
        settings: 'API密钥设置',
        placeholderLine1: '用中文告诉我你想做什么。',
        placeholderExample: '例如："让小猫在点击绿旗后一直向右移动"',
        inputPlaceholder: '输入指令...',
        send: '发送',
        stop: '■ 终止',
        thinking: '思考中...',
        toggleBlocks: '区块操作',
        toggleDisabledTitle: '试用模式下无法使用区块操作。从 ⚙️ 设置自己的 API 密钥即可使用',
        toolCopy: '复制',
        toolCopied: '已复制 ✓',
        toolErrorTitle: '点击显示错误详情',
        trialBanner: '🎁 正在使用试用模式（DeepSeek V3・有限制）。可从 ⚙️ 设置自己的 API 密钥',
        noKey: '请点击 ⚙️ 设置 API 密钥',
        // 容器的错误提示
        vmNotReady: 'Scratch 编辑器尚未加载完成。',
        authInvalid: 'API 密钥无效。请重新设置。',
        stopped: '（已停止）',
        // API 密钥 / 模型设置弹窗
        modalTitle: 'API 密钥 / 模型设置',
        modalModelLabel: '使用模型',
        modalCancel: '取消',
        modalSave: '存储',
        keyStoredNote: '密钥仅保存在此浏览器的 localStorage 中。',
        anthropicDesc: '请输入 Anthropic API 密钥以使用 Claude。',
        deepseekDesc: '请输入 DeepSeek API 密钥。',
        openaiDesc: '请输入 OpenAI API 密钥。',
        geminiDesc: '请输入 Google Gemini API 密钥。',
        hintPrefix: 'API 密钥可在 ',
        hintSuffix: ' 获取。'
    }
};

// 工具输入生成中的进度后缀(「(120字符)」/「(120 chars)」/「(120个字符)」)
export const draftingChars = (lang, chars) => {
    if (chars <= 0) return '';
    if (lang === 'ja') return ` (${chars}文字)`;
    if (lang === 'zh') return ` (${chars}个字符)`;
    return ` (${chars} chars)`;
};

// 运行时错误的前缀
export const errorPrefix = (lang, msg) => {
    if (lang === 'ja') return `エラー: ${msg}`;
    if (lang === 'zh') return `错误: ${msg}`;
    return `Error: ${msg}`;
};

// 价格表链接的标签
export const pricingLabel = (lang, providerLabel) => {
    if (lang === 'ja') return `${providerLabel} の料金表(API利用料)`;
    if (lang === 'zh') return `${providerLabel} 价格表（API 使用费）`;
    return `${providerLabel} pricing (API usage)`;
};

// 建议按钮（示例句按钮）。en 版本避开日语特有的题材（nekonige 等），使用通用示例。
export const SUGGESTIONS_BY_LANG = {
    ja: [
        {label: 'ネコ逃げゲームを教えて', text: 'https://github.com/champierre/nekonige で紹介しているネコ逃げゲームの作り方を教えて', disableBlocks: true},
        {label: 'ネコを動かして', text: 'ネコが旗をクリックしたら右に動き続けるようにして'}
    ],
    en: [
        {label: 'Make the cat move', text: 'Make the cat move right continuously when the green flag is clicked'},
        {label: 'Make a chase game', text: 'Make a simple game where the cat follows the mouse pointer'}
    ],
    zh: [
        {label: '让小猫动起来', text: '让小猫在点击绿旗后一直向右移动'},
        {label: '制作追逐游戏', text: '制作一个简单的游戏，让小猫跟随鼠标指针'}
    ]
};
