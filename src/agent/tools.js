// 传递给 Anthropic Messages API 的工具定义(input_schema)
// 顺序固定（因为 prompt caching，不要更改）
//
// 国际化：每个 tool / input_schema 字段都使用 description_i18n: {ja, en, zh} 形式定义，
// 由 getTools(lang) 在请求时解析为 description 字段发给 LLM。这样 prompt 缓存按 lang
// 段独立失效（与 system prompt 的 lang 切换行为一致）。

const SCRIPTS_SCHEMA_DEF = {
    type: 'array',
    description_i18n: {
        ja: 'DSL形式のスクリプト配列。各要素は {x?, y?, blocks: [...]}',
        en: 'DSL script array. Each element is {x?, y?, blocks: [...]}',
        zh: 'DSL 脚本数组。每个元素为 {x?, y?, blocks: [...]}'
    },
    items: {
        type: 'object',
        properties: {
            x: {type: 'number'},
            y: {type: 'number'},
            blocks: {type: 'array', items: {type: 'object'}}
        },
        required: ['blocks']
    }
};

// blocksEnabled=false 时要排除的工具名集合
//（get_project_state / search_library / fetch_url 是只读的，所以始终可用）
export const BLOCK_TOOL_NAMES = new Set([
    'add_sprite',
    'delete_sprite',
    'rename_sprite',
    'add_costume',
    'add_sound',
    'add_backdrop',
    'set_scripts',
    'set_sprite_properties',
    'start_project',
    'stop_project'
]);

const TOOL_DEFS = [
    {
        name: 'get_project_state',
        description_i18n: {
            ja: '現在のプロジェクトの状態(全ターゲットのスプライト情報・コスチューム・音・変数・スクリプト)をDSL形式で取得する。作業前に必ず呼んで現状を把握すること。',
            en: 'Get the current project state (all targets, sprites, costumes, sounds, variables, and scripts) in DSL form. Always call this first to understand the current state before making changes.',
            zh: '以 DSL 形式获取当前项目状态（所有目标、角色、造型、声音、变量、脚本）。开始之前务必先调用此工具了解现状。'
        },
        input_schema: {type: 'object', properties: {}}
    },
    {
        name: 'search_library',
        description_i18n: {
            ja: 'Scratch標準ライブラリからスプライト/コスチューム/音/背景を検索する。queryは英語(例: dog, ball, jump, forest)。',
            en: 'Search the standard Scratch library for sprites / costumes / sounds / backdrops. query must be in English (e.g. dog, ball, jump, forest).',
            zh: '从 Scratch 标准库中搜索角色/造型/声音/背景。query 必须使用英文（例如 dog、ball、jump、forest）。'
        },
        input_schema: {
            type: 'object',
            properties: {
                kind: {type: 'string', enum: ['sprite', 'costume', 'sound', 'backdrop']},
                query: {type: 'string', description_i18n: {
                    ja: '英語の検索キーワード',
                    en: 'search keyword in English',
                    zh: '英文搜索关键词'
                }}
            },
            required: ['kind', 'query']
        }
    },
    {
        name: 'add_sprite',
        description_i18n: {
            ja: '標準ライブラリからスプライトを追加する。nameはライブラリ上の正確な名前(search_libraryで確認)。',
            en: 'Add a sprite from the standard library. name must be the exact library name (confirm via search_library).',
            zh: '从标准库添加角色。name 必须是库中的准确名称（先用 search_library 确认）。'
        },
        input_schema: {
            type: 'object',
            properties: {
                name: {type: 'string', description_i18n: {
                    ja: 'ライブラリのスプライト名(例: Dog2, Ball)',
                    en: 'sprite name in the library (e.g. Dog2, Ball)',
                    zh: '库中的角色名（例如 Dog2、Ball）'
                }}
            },
            required: ['name']
        }
    },
    {
        name: 'delete_sprite',
        description_i18n: {
            ja: 'スプライトを削除する。',
            en: 'Delete a sprite.',
            zh: '删除一个角色。'
        },
        input_schema: {
            type: 'object',
            properties: {
                target: {type: 'string', description_i18n: {
                    ja: 'スプライト名',
                    en: 'sprite name',
                    zh: '角色名'
                }}
            },
            required: ['target']
        }
    },
    {
        name: 'rename_sprite',
        description_i18n: {
            ja: 'スプライトの名前を変更する。',
            en: 'Rename a sprite.',
            zh: '修改一个角色的名称。'
        },
        input_schema: {
            type: 'object',
            properties: {
                target: {type: 'string'},
                new_name: {type: 'string'}
            },
            required: ['target', 'new_name']
        }
    },
    {
        name: 'add_costume',
        description_i18n: {
            ja: '標準ライブラリからコスチュームをスプライトに追加する。',
            en: 'Add a costume from the standard library to a sprite.',
            zh: '从标准库添加一个造型到角色。'
        },
        input_schema: {
            type: 'object',
            properties: {
                target: {type: 'string', description_i18n: {
                    ja: 'スプライト名',
                    en: 'sprite name',
                    zh: '角色名'
                }},
                costume_name: {type: 'string', description_i18n: {
                    ja: 'ライブラリのコスチューム名',
                    en: 'costume name in the library',
                    zh: '库中的造型名'
                }}
            },
            required: ['target', 'costume_name']
        }
    },
    {
        name: 'add_sound',
        description_i18n: {
            ja: '標準ライブラリから音をスプライトまたはステージに追加する。',
            en: 'Add a sound from the standard library to a sprite or the stage.',
            zh: '从标准库添加一个声音到角色或舞台。'
        },
        input_schema: {
            type: 'object',
            properties: {
                target: {type: 'string', description_i18n: {
                    ja: 'スプライト名または "Stage"',
                    en: 'sprite name or "Stage"',
                    zh: '角色名或 "Stage"'
                }},
                sound_name: {type: 'string', description_i18n: {
                    ja: 'ライブラリの音名(例: Meow, Pop)',
                    en: 'sound name in the library (e.g. Meow, Pop)',
                    zh: '库中的声音名（例如 Meow、Pop）'
                }}
            },
            required: ['target', 'sound_name']
        }
    },
    {
        name: 'add_backdrop',
        description_i18n: {
            ja: '標準ライブラリから背景をステージに追加する。',
            en: 'Add a backdrop from the standard library to the stage.',
            zh: '从标准库添加一个背景到舞台。'
        },
        input_schema: {
            type: 'object',
            properties: {
                backdrop_name: {type: 'string', description_i18n: {
                    ja: 'ライブラリの背景名',
                    en: 'backdrop name in the library',
                    zh: '库中的背景名'
                }}
            },
            required: ['backdrop_name']
        }
    },
    {
        name: 'set_scripts',
        description_i18n: {
            ja: 'ターゲットのスクリプト(ブロック)をDSLで設定する。append未指定(置換)では既存スクリプトがすべて消えるので、残したいスクリプトも含めて全部を指定すること。1回で組めるのは50ブロックまで。大きな作品は複数回に分け、2回目以降は append: true で既存に追加する。',
            en: 'Set a target\'s scripts (blocks) via DSL. Without append (default = replace), all existing scripts are removed, so include everything you want to keep in one call. Up to 50 blocks per call. For larger projects, split into multiple calls and use append: true from the second call onward.',
            zh: '使用 DSL 设置目标的脚本（积木）。未指定 append（默认替换）会清除所有现有脚本，因此请在一次调用中包含所有需要保留的脚本。单次最多组装 50 个积木。较大的作品需要分多次调用，从第二次起使用 append: true 追加。'
        },
        input_schema: {
            type: 'object',
            properties: {
                target: {type: 'string', description_i18n: {
                    ja: 'スプライト名または "Stage"',
                    en: 'sprite name or "Stage"',
                    zh: '角色名或 "Stage"'
                }},
                scripts: SCRIPTS_SCHEMA_DEF,
                append: {type: 'boolean', description_i18n: {
                    ja: 'trueなら既存スクリプトを残して追加する(デフォルトは置換)',
                    en: 'if true, keep existing scripts and append (default is replace)',
                    zh: '为 true 时保留现有脚本并追加（默认替换）'
                }}
            },
            required: ['target', 'scripts']
        }
    },
    {
        name: 'set_sprite_properties',
        description_i18n: {
            ja: 'スプライトの位置・大きさ・向き・表示状態を直接設定する(初期配置に便利)。',
            en: 'Directly set a sprite\'s position, size, direction, and visibility (useful for initial placement).',
            zh: '直接设置角色的位置、大小、方向和可见性（用于初始放置很方便）。'
        },
        input_schema: {
            type: 'object',
            properties: {
                target: {type: 'string'},
                x: {type: 'number'},
                y: {type: 'number'},
                size: {type: 'number', description_i18n: {
                    ja: 'パーセント(100が標準)',
                    en: 'percentage (100 is standard)',
                    zh: '百分比（100 为标准）'
                }},
                direction: {type: 'number', description_i18n: {
                    ja: '90が右向き',
                    en: '90 is right',
                    zh: '90 表示向右'
                }},
                visible: {type: 'boolean'}
            },
            required: ['target']
        }
    },
    {
        name: 'start_project',
        description_i18n: {
            ja: '緑の旗を押してプロジェクトを実行する(動作確認用)。',
            en: 'Click the green flag to run the project (for behavior verification).',
            zh: '点击绿旗运行项目（用于行为验证）。'
        },
        input_schema: {type: 'object', properties: {}}
    },
    {
        name: 'stop_project',
        description_i18n: {
            ja: 'プロジェクトの実行を止める。',
            en: 'Stop the project execution.',
            zh: '停止项目执行。'
        },
        input_schema: {type: 'object', properties: {}}
    },
    {
        name: 'fetch_url',
        description_i18n: {
            ja: 'URLのページ内容(テキスト/HTML/Markdown)を取得する。GitHubのREADMEやWebページを参照して内容を説明するときに使う。',
            en: 'Fetch the contents (text/HTML/Markdown) of a URL. Use this when referencing GitHub READMEs or web pages to explain their content.',
            zh: '获取 URL 页面的内容（文本/HTML/Markdown）。在引用 GitHub README 或网页以说明其内容时使用。'
        },
        input_schema: {
            type: 'object',
            properties: {
                url: {type: 'string', description_i18n: {
                    ja: '取得するURL(http/https)',
                    en: 'URL to fetch (http/https)',
                    zh: '要获取的 URL（http/https）'
                }}
            },
            required: ['url']
        }
    }
];

// 将含 description_i18n 的 schema 节点解析为带 description 的本地化副本。
// 不可变：每次都返回新对象，避免调用方意外共享引用。
// 导出供 runtime-tools.js 复用。
//
// 处理逻辑：
//   - 原始字段：跳过 description_i18n
//   - 数组：递归处理每个元素（处理 oneOf 等结构）
//   - 对象：递归处理每个字段
//   - 当前节点若有 description_i18n：解析为 description 字段
export const localizeSchema = (schema, lang) => {
    if (schema === null || typeof schema !== 'object') return schema;
    if (Array.isArray(schema)) return schema.map(item => localizeSchema(item, lang));
    const out = {};
    for (const [k, v] of Object.entries(schema)) {
        if (k === 'description_i18n') continue;
        out[k] = (v && typeof v === 'object') ? localizeSchema(v, lang) : v;
    }
    if ('description_i18n' in schema) {
        out.description = schema.description_i18n[lang] || schema.description_i18n.ja;
    }
    return out;
};

// 将一个 TOOL_DEF 解析为 lang 语言下的 tool 定义（带 description + cache_control 等运行时字段）。
// 调用方在每轮循环开始时拿到这个数组；同一 lang 下多次调用返回同一引用（cache）。
const localizeToolDef = (def, lang) => ({
    name: def.name,
    description: def.description_i18n[lang] || def.description_i18n.ja,
    input_schema: localizeSchema(def.input_schema, lang)
});

const _toolsCache = new Map();

/**
 * 获取 lang 语言下的工具定义数组。同一 lang 多次调用返回同一引用。
 * @param {'ja'|'en'|'zh'} lang
 * @returns {Array<object>}
 */
export const getTools = lang => {
    if (_toolsCache.has(lang)) return _toolsCache.get(lang);
    const arr = TOOL_DEFS.map(d => localizeToolDef(d, lang));
    _toolsCache.set(lang, arr);
    return arr;
};

// 工具输入生成中（流式传输中）UI 显示的进度标签
export const draftingLabel = (name, lang = 'ja') => {
    const ja = {
        set_scripts: 'ブロックを書いています',
        add_sprite: 'スプライトを選んでいます',
        search_library: 'ライブラリを探しています',
        set_sprite_properties: 'スプライトを配置しています',
        fetch_url: 'ページを取得しています',
        default: '次の操作を準備しています'
    };
    const en = {
        set_scripts: 'Writing blocks',
        add_sprite: 'Picking a sprite',
        search_library: 'Searching the library',
        set_sprite_properties: 'Placing the sprite',
        fetch_url: 'Fetching the page',
        default: 'Preparing the next action'
    };
    const zh = {
        set_scripts: '正在编写积木',
        add_sprite: '正在选择角色',
        search_library: '正在搜索库',
        set_sprite_properties: '正在放置角色',
        fetch_url: '正在获取页面',
        default: '正在准备下一个操作'
    };
    if (lang === 'en') return en[name] || en.default;
    if (lang === 'zh') return zh[name] || zh.default;
    return ja[name] || ja.default;
};

// 在聊天 UI 显示的工具执行摘要
export const summarizeToolCall = (name, input, lang = 'ja') => {
    if (lang === 'zh') {
        switch (name) {
        case 'get_project_state': return '正在检查项目状态';
        case 'search_library': return `库搜索: ${input.kind} "${input.query}"`;
        case 'add_sprite': return `添加角色: ${input.name}`;
        case 'delete_sprite': return `删除角色: ${input.target}`;
        case 'rename_sprite': return `重命名: ${input.target} → ${input.new_name}`;
        case 'add_costume': return `添加造型: ${input.costume_name} → ${input.target}`;
        case 'add_sound': return `添加声音: ${input.sound_name} → ${input.target}`;
        case 'add_backdrop': return `添加背景: ${input.backdrop_name}`;
        case 'set_scripts': return `正在组装积木: ${input.target}`;
        case 'set_sprite_properties': return `设置属性: ${input.target}`;
        case 'start_project': return '运行项目';
        case 'stop_project': return '停止项目';
        case 'fetch_url': return `获取URL: ${input.url}`;
        default: return name;
        }
    }
    if (lang === 'en') {
        switch (name) {
        case 'get_project_state': return 'Checking the project state';
        case 'search_library': return `Library search: ${input.kind} "${input.query}"`;
        case 'add_sprite': return `Add sprite: ${input.name}`;
        case 'delete_sprite': return `Delete sprite: ${input.target}`;
        case 'rename_sprite': return `Rename: ${input.target} → ${input.new_name}`;
        case 'add_costume': return `Add costume: ${input.costume_name} → ${input.target}`;
        case 'add_sound': return `Add sound: ${input.sound_name} → ${input.target}`;
        case 'add_backdrop': return `Add backdrop: ${input.backdrop_name}`;
        case 'set_scripts': return `Building blocks: ${input.target}`;
        case 'set_sprite_properties': return `Set properties: ${input.target}`;
        case 'start_project': return 'Run the project';
        case 'stop_project': return 'Stop the project';
        case 'fetch_url': return `Fetch URL: ${input.url}`;
        default: return name;
        }
    }
    switch (name) {
    case 'get_project_state': return 'プロジェクトの状態を確認';
    case 'search_library': return `ライブラリ検索: ${input.kind} "${input.query}"`;
    case 'add_sprite': return `スプライト追加: ${input.name}`;
    case 'delete_sprite': return `スプライト削除: ${input.target}`;
    case 'rename_sprite': return `名前変更: ${input.target} → ${input.new_name}`;
    case 'add_costume': return `コスチューム追加: ${input.costume_name} → ${input.target}`;
    case 'add_sound': return `音追加: ${input.sound_name} → ${input.target}`;
    case 'add_backdrop': return `背景追加: ${input.backdrop_name}`;
    case 'set_scripts': return `ブロックを組む: ${input.target}`;
    case 'set_sprite_properties': return `プロパティ設定: ${input.target}`;
    case 'start_project': return 'プロジェクトを実行';
    case 'stop_project': return 'プロジェクトを停止';
    case 'fetch_url': return `URLを取得: ${input.url}`;
    default: return name;
    }
};