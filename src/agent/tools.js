// 传递给 Anthropic Messages API 的工具定义(input_schema)
// 顺序固定（因为 prompt caching，不要更改）

const SCRIPTS_SCHEMA = {
    type: 'array',
    description: 'DSL形式のスクリプト配列。各要素は {x?, y?, blocks: [...]}',
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

export const TOOLS = [
    {
        name: 'get_project_state',
        description: '現在のプロジェクトの状態(全ターゲットのスプライト情報・コスチューム・音・変数・スクリプト)をDSL形式で取得する。作業前に必ず呼んで現状を把握すること。',
        input_schema: {type: 'object', properties: {}}
    },
    {
        name: 'search_library',
        description: 'Scratch標準ライブラリからスプライト/コスチューム/音/背景を検索する。queryは英語(例: dog, ball, jump, forest)。',
        input_schema: {
            type: 'object',
            properties: {
                kind: {type: 'string', enum: ['sprite', 'costume', 'sound', 'backdrop']},
                query: {type: 'string', description: '英語の検索キーワード'}
            },
            required: ['kind', 'query']
        }
    },
    {
        name: 'add_sprite',
        description: '標準ライブラリからスプライトを追加する。nameはライブラリ上の正確な名前(search_libraryで確認)。',
        input_schema: {
            type: 'object',
            properties: {
                name: {type: 'string', description: 'ライブラリのスプライト名(例: Dog2, Ball)'}
            },
            required: ['name']
        }
    },
    {
        name: 'delete_sprite',
        description: 'スプライトを削除する。',
        input_schema: {
            type: 'object',
            properties: {
                target: {type: 'string', description: 'スプライト名'}
            },
            required: ['target']
        }
    },
    {
        name: 'rename_sprite',
        description: 'スプライトの名前を変更する。',
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
        description: '標準ライブラリからコスチュームをスプライトに追加する。',
        input_schema: {
            type: 'object',
            properties: {
                target: {type: 'string', description: 'スプライト名'},
                costume_name: {type: 'string', description: 'ライブラリのコスチューム名'}
            },
            required: ['target', 'costume_name']
        }
    },
    {
        name: 'add_sound',
        description: '標準ライブラリから音をスプライトまたはステージに追加する。',
        input_schema: {
            type: 'object',
            properties: {
                target: {type: 'string', description: 'スプライト名または "Stage"'},
                sound_name: {type: 'string', description: 'ライブラリの音名(例: Meow, Pop)'}
            },
            required: ['target', 'sound_name']
        }
    },
    {
        name: 'add_backdrop',
        description: '標準ライブラリから背景をステージに追加する。',
        input_schema: {
            type: 'object',
            properties: {
                backdrop_name: {type: 'string', description: 'ライブラリの背景名'}
            },
            required: ['backdrop_name']
        }
    },
    {
        name: 'set_scripts',
        description: 'ターゲットのスクリプト(ブロック)をDSLで設定する。append未指定(置換)では既存スクリプトがすべて消えるので、残したいスクリプトも含めて全部を指定すること。1回で組めるのは50ブロックまで。大きな作品は複数回に分け、2回目以降は append: true で既存に追加する。',
        input_schema: {
            type: 'object',
            properties: {
                target: {type: 'string', description: 'スプライト名または "Stage"'},
                scripts: SCRIPTS_SCHEMA,
                append: {type: 'boolean', description: 'trueなら既存スクリプトを残して追加する(デフォルトは置換)'}
            },
            required: ['target', 'scripts']
        }
    },
    {
        name: 'set_sprite_properties',
        description: 'スプライトの位置・大きさ・向き・表示状態を直接設定する(初期配置に便利)。',
        input_schema: {
            type: 'object',
            properties: {
                target: {type: 'string'},
                x: {type: 'number'},
                y: {type: 'number'},
                size: {type: 'number', description: 'パーセント(100が標準)'},
                direction: {type: 'number', description: '90が右向き'},
                visible: {type: 'boolean'}
            },
            required: ['target']
        }
    },
    {
        name: 'start_project',
        description: '緑の旗を押してプロジェクトを実行する(動作確認用)。',
        input_schema: {type: 'object', properties: {}}
    },
    {
        name: 'stop_project',
        description: 'プロジェクトの実行を止める。',
        input_schema: {type: 'object', properties: {}}
    },
    {
        name: 'fetch_url',
        description: 'URLのページ内容(テキスト/HTML/Markdown)を取得する。GitHubのREADMEやWebページを参照して内容を説明するときに使う。',
        input_schema: {
            type: 'object',
            properties: {
                url: {type: 'string', description: '取得するURL(http/https)'}
            },
            required: ['url']
        }
    }
];

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
