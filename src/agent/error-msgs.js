// 集中管理 agent 工具链抛出的错误 / 反馈信息。
// 每个 key 对应一个 {ja, en, zh} 翻译三元组；带参数的条目用函数形式。
//
// 调用方通过 t(key, lang, ...args) 获取本地化字符串：
//   t('stageCannotMove', 'zh')  -> '舞台不能移动'
//   t('targetNotFound', 'en', 'Foo', ['Stage', 'Bar']) -> 'Target "Foo" not found. Existing targets: Stage, Bar'
//
// 设计原则（CLAUDE.md「用逻辑确保可靠」）：
// - 所有 throw new ToolError / new BuildError 的本地化文本必须通过本目录
// - 静态守护（test/static-checks.js）会扫描 throw new ToolError / new BuildError，
//   防止有人直接写日语字面量绕过目录（让 drift 立即被 CI 抓到）

// 抛出参数化错误时使用的快捷构造（handler 端使用）。
// 注意：本模块不 import ToolError / BuildError，避免循环依赖；handler 自己包装。

const joinJa = arr => arr.join('、');
const joinZh = arr => arr.join('、');

// ---- block-builder.js 抛出的 BuildError ----

export const ERROR_MSGS = {

    // --- block-builder ---

    scriptsNotArray: {
        ja: 'scripts は配列である必要があります',
        en: 'scripts must be an array',
        zh: 'scripts 必须是数组'
    },

    scriptsMissingBlocks: i => ({
        ja: `scripts[${i}] に blocks 配列がありません`,
        en: `scripts[${i}] is missing a blocks array`,
        zh: `scripts[${i}] 缺少 blocks 数组`
    }),

    valueBlockInStack: (path, opcode) => ({
        ja: `${path}: ${opcode} は値ブロックなのでスタックに直接置けません(inputs の中で使ってください)`,
        en: `${path}: ${opcode} is a value block and cannot be placed directly in a stack (use it inside inputs)`,
        zh: `${path}: ${opcode} 是值块，不能直接放在语句堆栈中（请在 inputs 内使用）`
    }),

    hatNotAtTop: (path, opcode) => ({
        ja: `${path}: ハットブロック ${opcode} はスクリプトの先頭にのみ置けます`,
        en: `${path}: hat block ${opcode} can only be placed at the start of a script`,
        zh: `${path}: 帽子块 ${opcode} 只能放在脚本的开头`
    }),

    invalidBlockDef: path => ({
        ja: `${path}: ブロックは {"opcode": ...} 形式のオブジェクトである必要があります`,
        en: `${path}: a block must be an object of the form {"opcode": ...}`,
        zh: `${path}: 块必须是 {"opcode": ...} 形式的对象`
    }),

    unknownOpcode: (path, opcode) => ({
        ja: `${path}: 未知のopcode "${opcode}" です。利用可能なopcode一覧から選んでください`,
        en: `${path}: unknown opcode "${opcode}". Pick one from the available opcodes list`,
        zh: `${path}: 未知的 opcode "${opcode}"。请从可用的 opcode 列表中选择`
    }),

    fieldRequired: (path, opcode, fieldName) => ({
        ja: `${path}: ${opcode} には fields.${fieldName} が必要です`,
        en: `${path}: ${opcode} requires fields.${fieldName}`,
        zh: `${path}: ${opcode} 需要 fields.${fieldName}`
    }),

    fieldNotBlock: (path, fieldName) => ({
        ja: `${path}.fields.${fieldName}: フィールドにはブロックを入れられません(文字列を指定してください)`,
        en: `${path}.fields.${fieldName}: fields cannot contain blocks (specify a string)`,
        zh: `${path}.fields.${fieldName}: 字段不能放入块（请指定字符串）`
    }),

    invalidChoice: (path, what, value, allowed) => ({
        ja: `${path}: ${what} に "${value}" は使えません。使える値: ${allowed.map(v => `"${v}"`).join(', ')}`,
        en: `${path}: "${value}" is not allowed for ${what}. Allowed values: ${allowed.map(v => `"${v}"`).join(', ')}`,
        zh: `${path}: ${what} 不能使用 "${value}"。可用值：${allowed.map(v => `「${v}」`).join('、')}`
    }),

    booleanInputNeedsBlock: path => ({
        ja: `${path}: 真偽値入力にはブロック({"opcode": ...})が必要です`,
        en: `${path}: a boolean input requires a block ({"opcode": ...})`,
        zh: `${path}: 布尔输入需要一个块（{"opcode": ...}）`
    }),

    broadcastNameRequired: path => ({
        ja: `${path}: ブロードキャスト名(文字列)が必要です`,
        en: `${path}: a broadcast name (string) is required`,
        zh: `${path}: 需要广播名称（字符串）`
    }),

    unknownArgType: (path, argType) => ({
        ja: `${path}: 不明な引数タイプ ${argType}`,
        en: `${path}: unknown argument type ${argType}`,
        zh: `${path}: 未知的参数类型 ${argType}`
    }),

    colorFormat: path => ({
        ja: `${path}: 色は "#rrggbb" 形式で指定してください(例: "#ff0000")`,
        en: `${path}: color must be in "#rrggbb" format (e.g. "#ff0000")`,
        zh: `${path}: 颜色必须使用 "#rrggbb" 格式（例如 "#ff0000"）`
    }),

    notValueBlock: (path, opcode) => ({
        ja: `${path}: ${opcode} は値ブロックではないので入力に使えません`,
        en: `${path}: ${opcode} is not a value block and cannot be used as an input`,
        zh: `${path}: ${opcode} 不是值块，不能用作输入`
    }),

    booleanInputNeedsBooleanBlock: (path, opcode) => ({
        ja: `${path}: 真偽値入力には六角形(boolean)ブロックが必要です(${opcode} は不可)`,
        en: `${path}: a boolean input requires a hexagonal (boolean) block (${opcode} cannot be used)`,
        zh: `${path}: 布尔输入需要六角形（boolean）块（${opcode} 不可用）`
    }),

    // --- tool-handlers ---

    targetNotFound: (name, existing) => ({
        ja: `ターゲット "${name}" が見つかりません。存在するターゲット: ${joinJa(existing)}`,
        en: `Target "${name}" not found. Existing targets: ${existing.join(', ')}`,
        zh: `找不到目标 "${name}"。现有目标：${joinZh(existing)}`
    }),

    blocksDisabled: {
        ja: 'ブロック操作は現在オフになっています。',
        en: 'Block editing is currently turned off.',
        zh: '区块操作当前已关闭。'
    },

    queryRequired: {
        ja: 'query が必要です',
        en: 'a query is required',
        zh: '需要 query'
    },

    invalidKind: {
        ja: 'kind は sprite / costume / sound / backdrop のいずれかです',
        en: 'kind must be one of sprite / costume / sound / backdrop',
        zh: 'kind 必须是 sprite / costume / sound / backdrop 之一'
    },

    spriteNotFound: (name, candidates) => ({
        ja: `ライブラリにスプライト "${name}" がありません。` +
            (candidates.length ? `候補: ${joinJa(candidates)}` : 'search_library で探してください'),
        en: `Sprite "${name}" is not in the library. ` +
            (candidates.length ? `Candidates: ${candidates.join(', ')}` : 'Try searching with search_library'),
        zh: `库中没有角色 "${name}"。` +
            (candidates.length ? `候选：${joinZh(candidates)}` : '请使用 search_library 搜索')
    }),

    stageCannotDelete: {
        ja: 'ステージは削除できません',
        en: 'The stage cannot be deleted',
        zh: '舞台不能删除'
    },

    stageCannotRename: {
        ja: 'ステージの名前は変更できません',
        en: 'The stage cannot be renamed',
        zh: '舞台不能重命名'
    },

    costumeNotFound: (name, candidates) => ({
        ja: `ライブラリにコスチューム "${name}" がありません。` +
            (candidates.length ? `候補: ${joinJa(candidates)}` : 'search_library で探してください'),
        en: `Costume "${name}" is not in the library. ` +
            (candidates.length ? `Candidates: ${candidates.join(', ')}` : 'Try searching with search_library'),
        zh: `库中没有造型 "${name}"。` +
            (candidates.length ? `候选：${joinZh(candidates)}` : '请使用 search_library 搜索')
    }),

    soundNotFound: (name, candidates) => ({
        ja: `ライブラリに音 "${name}" がありません。` +
            (candidates.length ? `候補: ${joinJa(candidates)}` : 'search_library で探してください'),
        en: `Sound "${name}" is not in the library. ` +
            (candidates.length ? `Candidates: ${candidates.join(', ')}` : 'Try searching with search_library'),
        zh: `库中没有声音 "${name}"。` +
            (candidates.length ? `候选：${joinZh(candidates)}` : '请使用 search_library 搜索')
    }),

    backdropNotFound: (name, candidates) => ({
        ja: `ライブラリに背景 "${name}" がありません。` +
            (candidates.length ? `候補: ${joinJa(candidates)}` : 'search_library で探してください'),
        en: `Backdrop "${name}" is not in the library. ` +
            (candidates.length ? `Candidates: ${candidates.join(', ')}` : 'Try searching with search_library'),
        zh: `库中没有背景 "${name}"。` +
            (candidates.length ? `候选：${joinZh(candidates)}` : '请使用 search_library 搜索')
    }),

    tooManyBlocks: (count, max) => ({
        ja: `一度に組むブロックが多すぎます(${count}個 / 上限${max}個)。` +
            'スクリプトを分けて、2回目以降は append: true で追加してください',
        en: `Too many blocks to assemble at once (${count} / limit ${max}). ` +
            'Split the script across multiple calls; use append: true for the second and later calls',
        zh: `一次组装的积木过多（${count} 个 / 上限 ${max} 个）。` +
            '请拆分成多次调用，第二次及之后请使用 append: true 追加'
    }),

    stageCannotSetProperties: {
        ja: 'ステージには位置などのプロパティを設定できません',
        en: 'Properties such as position cannot be set on the stage',
        zh: '不能为舞台设置位置等属性'
    },

    urlRequired: {
        ja: 'url が必要です',
        en: 'a url is required',
        zh: '需要 url'
    },

    networkError: (msg, browserOnly) => ({
        ja: `ネットワークエラー: ${msg}${browserOnly ? '(このサイトはブラウザから直接取得できない可能性があります)' : ''}`,
        en: `Network error: ${msg}${browserOnly ? ' (this site may not be reachable directly from the browser)' : ''}`,
        zh: `网络错误：${msg}${browserOnly ? '（此网站可能无法从浏览器直接获取）' : ''}`
    }),

    fetchFailed: (errMsg, endpoint) => ({
        ja: `取得失敗: ${errMsg} (${endpoint})`,
        en: `Fetch failed: ${errMsg} (${endpoint})`,
        zh: `获取失败：${errMsg}（${endpoint}）`
    }),

    // --- runtime-handlers ---

    mousePositionUnavailable: {
        ja: 'マウス位置を取得できません',
        en: 'The mouse position is not available',
        zh: '无法获取鼠标位置'
    },

    invalidDestination: {
        ja: 'destination の形式が無効です',
        en: 'destination has an invalid format',
        zh: 'destination 格式无效'
    },

    coordinatesUnavailable: {
        ja: '座標を取得できません',
        en: 'The coordinates are not available',
        zh: '无法获取坐标'
    },

    extensionPrimitiveTimeout: (extensionId, opcode) => ({
        ja: `拡張機能 "${extensionId}" の primitive "${opcode}" が登録されませんでした（タイムアウト）`,
        en: `Primitive "${opcode}" of extension "${extensionId}" was not registered (timeout)`,
        zh: `扩展 "${extensionId}" 的 primitive "${opcode}" 注册超时`
    }),

    extensionManagerUnavailable: {
        ja: 'extensionManager が利用できません',
        en: 'extensionManager is not available',
        zh: 'extensionManager 不可用'
    },

    stageCannotMove: {
        ja: 'ステージは移動できません',
        en: 'The stage cannot be moved',
        zh: '舞台不能移动'
    },

    stageCannotTurn: {
        ja: 'ステージは回転できません',
        en: 'The stage cannot be rotated',
        zh: '舞台不能旋转'
    },

    stageCannotSetPosition: {
        ja: 'ステージは位置を設定できません',
        en: 'The stage cannot have its position set',
        zh: '不能为舞台设置位置'
    },

    stageCannotSetDirection: {
        ja: 'ステージは向きを設定できません',
        en: 'The stage cannot have its direction set',
        zh: '不能为舞台设置方向'
    },

    stageCannotSetSize: {
        ja: 'ステージはサイズを設定できません',
        en: 'The stage cannot have its size set',
        zh: '不能为舞台设置大小'
    },

    stageCannotSetCostume: {
        ja: 'ステージのコスチューム切替は actor_add_backdrop を使ってください',
        en: 'To switch the stage backdrop, use actor_add_backdrop instead',
        zh: '如需切换舞台背景，请改用 actor_add_backdrop'
    },

    runtimeCostumeNotFound: (costume, candidates) => ({
        ja: `コスチューム "${costume}" が見つかりません。候補: ${joinJa(candidates)}`,
        en: `Costume "${costume}" not found. Candidates: ${candidates.join(', ')}`,
        zh: `找不到造型 "${costume}"。候选：${joinZh(candidates)}`
    }),

    costumeSetFailed: costume => ({
        ja: `コスチューム "${costume}" の設定に失敗しました`,
        en: `Failed to set costume "${costume}"`,
        zh: `设置造型 "${costume}" 失败`
    }),

    stageCannotSetVisible: {
        ja: 'ステージの表示切替はできません',
        en: 'The stage visibility cannot be toggled',
        zh: '不能切换舞台的可见性'
    },

    invalidLayer: {
        ja: 'layer は "front" または "back" です',
        en: 'layer must be "front" or "back"',
        zh: 'layer 必须是 "front" 或 "back"'
    },

    stageCannotSpeak: {
        ja: 'ステージは speak できません',
        en: 'The stage cannot speak',
        zh: '舞台不能 speak'
    },

    stageCannotThink: {
        ja: 'ステージは think できません',
        en: 'The stage cannot think',
        zh: '舞台不能 think'
    },

    stageHasNoBubble: {
        ja: 'ステージは吹き出しを持ちません',
        en: 'The stage has no speech bubble',
        zh: '舞台没有气泡'
    },

    stageCannotGlide: {
        ja: 'ステージは滑行できません',
        en: 'The stage cannot glide',
        zh: '舞台不能滑行'
    },

    stageCannotPoint: {
        ja: 'ステージは向きを変えられません',
        en: 'The stage cannot change its direction',
        zh: '舞台不能改变方向'
    },

    stageCannotClone: {
        ja: 'ステージは複製できません',
        en: 'The stage cannot be cloned',
        zh: '舞台不能被克隆'
    },

    stageCannotUsePen: {
        ja: 'ステージにはペンを使えません',
        en: 'The pen cannot be used on the stage',
        zh: '舞台上不能使用画笔'
    },

    stageCannotStamp: {
        ja: 'ステージにはスタンプを使えません',
        en: 'Stamp cannot be used on the stage',
        zh: '舞台上不能使用图章'
    },

    invalidColorFormat: input => ({
        ja: `color は "#rrggbb" 形式または 0xRRGGBB 整数です（入力: ${input}）`,
        en: `color must be in "#rrggbb" format or a 0xRRGGBB integer (input: ${input})`,
        zh: `color 必须是 "#rrggbb" 格式或 0xRRGGBB 整数（输入：${input}）`
    }),

    invalidColorInput: {
        ja: 'color は "#rrggbb" 文字列または 0xRRGGBB 整数で指定してください',
        en: 'color must be a "#rrggbb" string or a 0xRRGGBB integer',
        zh: 'color 必须是 "#rrggbb" 字符串或 0xRRGGBB 整数'
    },

    invalidColorParam: (allowed) => ({
        ja: `param は ${joinJa(allowed)} のいずれかです`,
        en: `param must be one of ${allowed.join(', ')}`,
        zh: `param 必须是 ${joinZh(allowed)} 之一`
    }),

    stageCannotSetVoice: {
        ja: 'ステージは音声設定できません',
        en: 'The stage cannot have its voice set',
        zh: '不能为舞台设置语音'
    },

    stageCannotSetSpeechLanguage: {
        ja: 'ステージは言語設定できません',
        en: 'The stage cannot have its speech language set',
        zh: '不能为舞台设置语音语言'
    },

    invalidExtensionId: (input, known) => ({
        ja: `extension_id は ${joinJa(known)} のいずれかです（入力: ${input}）`,
        en: `extension_id must be one of ${known.join(', ')} (input: ${input})`,
        zh: `extension_id 必须是 ${joinZh(known)} 之一（输入：${input}）`
    }),

    // 成功时的 hint（actor_ensure_extension 返回值），不是错误但也是本地化字符串
    extensionReadyHint: extensionId => ({
        ja: `${extensionId} 拡張が有効になりました。関連するツールを呼び出せます。`,
        en: `Extension "${extensionId}" is now enabled. You can call the related tools.`,
        zh: `扩展 "${extensionId}" 已启用。可以调用相关工具。`
    })
};

/**
 * 获取本地化错误消息。
 * @param {string} key ERROR_MSGS 的 key
 * @param {'ja'|'en'|'zh'} lang 目标语言
 * @param {...any} args 参数化条目的参数
 * @returns {string} 本地化文本
 */
export const t = (key, lang, ...args) => {
    const entry = ERROR_MSGS[key];
    if (!entry) {
        // dev-only 守护：未知 key 时给出可读的回退，避免静默通过
        if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production') {
            // eslint-disable-next-line no-console
            console.warn(`[error-msgs] unknown key: ${key}`);
        }
        return `[${key}]`;
    }
    const v = typeof entry === 'function' ? entry(...args) : entry;
    if (lang === 'en') return v.en || v.ja;
    if (lang === 'zh') return v.zh || v.ja;
    return v.ja;
};