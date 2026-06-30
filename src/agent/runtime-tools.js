// Runtime Actor 模式的工具 schema（Anthropic input_schema）
//
// 与现有 TOOLS（程序员模式）完全独立：所有工具名以 actor_ 前缀开头，
// 避免与程序员模式的 set_scripts 等工具命名冲突。
//
// 设计要点：
//   - 写入动作（move / set_position 等）的返回结果强制包含 post-state（由 runtime-handlers.js 实现），
//     实现 closed feedback loop（LLM 每次动作后必定看到最新状态）
//   - get_state 是唯一的全量观察入口；list_sprites 是轻量枚举入口
//   - 资产/克隆/执行控制工具与程序员模式共享底层（createToolHandlers / vm.*），只是命名空间前缀不同
//   - 画笔/音乐/朗读/翻译通过 scratch-vm 扩展（pen / music / text2speech / translate）的
//     block primitive 实现，第一次调用时自动加载扩展

const spriteNameProp = {type: 'string', description: 'スプライト名（実名。actor_list_sprites で確認）'};
const xyProps = {
    x: {type: 'number', description: 'ステージ X 座標（-240〜240）'},
    y: {type: 'number', description: 'ステージ Y 座標（-180〜180）'}
};

export const RUNTIME_TOOLS = [
    // ── 観察（読み取り）──────────────────────────────────────────
    {
        name: 'actor_get_state',
        description: '全スプライト（または指定スプライト）の現在のランタイム状態を取得する。' +
            '位置・向き・コスチューム・表示・吹き出しを含む。作業開始時および不確かな時に必ず呼ぶこと。',
        input_schema: {
            type: 'object',
            properties: {target: {type: 'string', description: '省略時は全スプライト。指定時はそのスプライトのみ'}}
        }
    },
    {
        name: 'actor_list_sprites',
        description: 'プロジェクト内のすべてのスプライト（とステージ）の名前と ID を列挙する。' +
            'get_state より軽量。スプライト名を確認したいときに使う。',
        input_schema: {type: 'object', properties: {}}
    },

    // ── 原子動作（書き込み：closed feedback loop で state を返す） ──
    {
        name: 'actor_move',
        description: 'スプライトを現在位置から相対移動する。向きに関係なく dx / dy の分だけ動く。',
        input_schema: {
            type: 'object',
            properties: {
                target: spriteNameProp,
                dx: {type: 'number', description: 'X 方向の移動量（正=右、負=左）'},
                dy: {type: 'number', description: 'Y 方向の移動量（正=上、負=下）'}
            },
            required: ['target', 'dx', 'dy']
        }
    },
    {
        name: 'actor_turn',
        description: 'スプライトを現在の方向から相対回転する。',
        input_schema: {
            type: 'object',
            properties: {
                target: spriteNameProp,
                degrees: {type: 'number', description: '回転量（正=右回り、負=左回り）'}
            },
            required: ['target', 'degrees']
        }
    },
    {
        name: 'actor_set_position',
        description: 'スプライトを指定した絶対座標に配置する。',
        input_schema: {
            type: 'object',
            properties: {target: spriteNameProp, ...xyProps},
            required: ['target', 'x', 'y']
        }
    },
    {
        name: 'actor_set_direction',
        description: 'スプライトの向きを絶対値で設定する（90=右、0=上、-90/270=左、180=下）。',
        input_schema: {
            type: 'object',
            properties: {
                target: spriteNameProp,
                direction: {type: 'number', description: '向き（90=右、0=上、-90=左、180=下）'}
            },
            required: ['target', 'direction']
        }
    },
    {
        name: 'actor_set_size',
        description: 'スプライトの大きさを変更する（100=標準）。',
        input_schema: {
            type: 'object',
            properties: {
                target: spriteNameProp,
                size: {type: 'number', description: '大きさ（パーセント、100が標準）'}
            },
            required: ['target', 'size']
        }
    },
    {
        name: 'actor_set_costume',
        description: 'スプライトのコスチュームを切り替える（名前またはインデックス）。',
        input_schema: {
            type: 'object',
            properties: {
                target: spriteNameProp,
                costume: {
                    oneOf: [
                        {type: 'string', description: 'コスチューム名（get_state の costumes 配列で確認）'},
                        {type: 'integer', description: 'コスチュームインデックス'}
                    ]
                }
            },
            required: ['target', 'costume']
        }
    },
    {
        name: 'actor_set_visible',
        description: 'スプライトの表示・非表示を切り替える。',
        input_schema: {
            type: 'object',
            properties: {
                target: spriteNameProp,
                visible: {type: 'boolean', description: 'true=表示、false=非表示'}
            },
            required: ['target', 'visible']
        }
    },
    {
        name: 'actor_set_layer',
        description: 'スプライトのレイヤー順序を変更する（"front"=最前面、"back"=最背面）。',
        input_schema: {
            type: 'object',
            properties: {
                target: spriteNameProp,
                layer: {type: 'string', enum: ['front', 'back']}
            },
            required: ['target', 'layer']
        }
    },
    {
        name: 'actor_say',
        description: 'スプライトにセリフを言わせる（吹き出しが出る）。別のセリフを言うまで残る。',
        input_schema: {
            type: 'object',
            properties: {
                target: spriteNameProp,
                text: {type: 'string', description: 'セリフの内容'}
            },
            required: ['target', 'text']
        }
    },
    {
        name: 'actor_think',
        description: 'スプライトに考えさせる（吹き出しが出る）。別の think を呼ぶまで残る。',
        input_schema: {
            type: 'object',
            properties: {
                target: spriteNameProp,
                text: {type: 'string', description: '考えの内容'}
            },
            required: ['target', 'text']
        }
    },
    {
        name: 'actor_stop_speaking',
        description: 'スプライトの吹き出しを消す。',
        input_schema: {
            type: 'object',
            properties: {target: spriteNameProp},
            required: ['target']
        }
    },
    {
        name: 'actor_glide',
        description: '指定秒数かけて滑らかに指定座標へ移動する（その間ループは待機）。',
        input_schema: {
            type: 'object',
            properties: {
                target: spriteNameProp,
                ...xyProps,
                secs: {type: 'number', description: '移動にかかる秒数'}
            },
            required: ['target', 'x', 'y', 'secs']
        }
    },
    {
        name: 'actor_point_towards',
        description: 'スプライトを特定の座標または別のスプライトの方へ向ける。',
        input_schema: {
            type: 'object',
            properties: {
                target: spriteNameProp,
                towards: {
                    type: 'object',
                    description: '向ける対象。座標 {x, y} または {sprite: "名前"}',
                    properties: {
                        x: {type: 'number'},
                        y: {type: 'number'},
                        sprite: {type: 'string'}
                    }
                }
            },
            required: ['target', 'towards']
        }
    },
    {
        name: 'actor_go_to',
        description: 'スプライトを別のスプライトの位置／マウス／座標へ瞬時に移動する。',
        input_schema: {
            type: 'object',
            properties: {
                target: spriteNameProp,
                destination: {
                    description: '移動先。文字列 "mouse-pointer"、スプライト名、または座標 {x, y}',
                    oneOf: [
                        {type: 'string'},
                        {
                            type: 'object',
                            properties: {
                                x: {type: 'number'},
                                y: {type: 'number'}
                            }
                        }
                    ]
                }
            },
            required: ['target', 'destination']
        }
    },

    // ── 資産 / クローン管理 ────────────────────────────────────────
    {
        name: 'actor_add_sprite',
        description: 'Scratch 標準ライブラリから新しいスプライトを追加する。',
        input_schema: {
            type: 'object',
            properties: {
                name: {type: 'string', description: 'ライブラリ上のスプライト名（例: Dog2, Ball）'}
            },
            required: ['name']
        }
    },
    {
        name: 'actor_delete_sprite',
        description: 'スプライトを削除する（ステージは削除不可）。',
        input_schema: {
            type: 'object',
            properties: {target: spriteNameProp},
            required: ['target']
        }
    },
    {
        name: 'actor_rename_sprite',
        description: 'スプライトの名前を変更する（ステージは不可）。',
        input_schema: {
            type: 'object',
            properties: {
                target: spriteNameProp,
                new_name: {type: 'string', description: '新しい名前'}
            },
            required: ['target', 'new_name']
        }
    },
    {
        name: 'actor_clone_sprite',
        description: '指定したスプライトを複製してスプライト一覧に追加する。',
        input_schema: {
            type: 'object',
            properties: {target: spriteNameProp},
            required: ['target']
        }
    },
    {
        name: 'actor_add_costume',
        description: 'ライブラリからコスチュームをスプライトに追加する。',
        input_schema: {
            type: 'object',
            properties: {
                target: spriteNameProp,
                costume_name: {type: 'string', description: 'ライブラリのコスチューム名'}
            },
            required: ['target', 'costume_name']
        }
    },
    {
        name: 'actor_add_sound',
        description: 'ライブラリから音をスプライト（または "Stage"）に追加する。',
        input_schema: {
            type: 'object',
            properties: {
                target: spriteNameProp,
                sound_name: {type: 'string', description: 'ライブラリの音名（例: Meow, Pop）'}
            },
            required: ['target', 'sound_name']
        }
    },
    {
        name: 'actor_add_backdrop',
        description: 'ライブラリから背景をステージに追加する。',
        input_schema: {
            type: 'object',
            properties: {
                backdrop_name: {type: 'string', description: 'ライブラリの背景名'}
            },
            required: ['backdrop_name']
        }
    },

    // ── 実行制御 ──────────────────────────────────────────────────
    {
        name: 'actor_start_project',
        description: '緑の旗を押してプロジェクトを実行する。',
        input_schema: {type: 'object', properties: {}}
    },
    {
        name: 'actor_stop_project',
        description: 'プロジェクトの実行を止める。',
        input_schema: {type: 'object', properties: {}}
    },

    // ── 画筆（pen 拡張機能） ────────────────────────────────────────
    {
        name: 'actor_pen_down',
        description: '指定したスプライトのペンを下ろす（以後、移動すると線が引かれる）。',
        input_schema: {
            type: 'object',
            properties: {target: spriteNameProp},
            required: ['target']
        }
    },
    {
        name: 'actor_pen_up',
        description: '指定したスプライトのペンを上げる（線が引かれなくなる）。',
        input_schema: {
            type: 'object',
            properties: {target: spriteNameProp},
            required: ['target']
        }
    },
    {
        name: 'actor_pen_clear',
        description: 'ステージ上のすべてのペン痕とスタンプを消去する。',
        input_schema: {type: 'object', properties: {}}
    },
    {
        name: 'actor_pen_stamp',
        description: '指定したスプライトの現在の姿をステージにスタンプする。',
        input_schema: {
            type: 'object',
            properties: {target: spriteNameProp},
            required: ['target']
        }
    },
    {
        name: 'actor_pen_set_color',
        description: 'ペンの色を設定する（"#rrggbb" 文字列または 0xRRGGBB 整数）。',
        input_schema: {
            type: 'object',
            properties: {
                target: spriteNameProp,
                color: {
                    description: '"#ff8800" のような 6桁 hex 文字列、または 0xFF8800 のような整数',
                    oneOf: [
                        {type: 'string', pattern: '^#?[0-9a-fA-F]{6}$'},
                        {type: 'integer', minimum: 0, maximum: 16777215}
                    ]
                }
            },
            required: ['target', 'color']
        }
    },
    {
        name: 'actor_pen_change_color_param',
        description: 'ペンの色相・彩度・明度・透明度のいずれかを指定量だけ変更する。',
        input_schema: {
            type: 'object',
            properties: {
                target: spriteNameProp,
                param: {type: 'string', enum: ['color', 'saturation', 'brightness', 'transparency']},
                value: {type: 'number'}
            },
            required: ['target', 'param', 'value']
        }
    },
    {
        name: 'actor_pen_set_color_param',
        description: 'ペンの色相・彩度・明度・透明度のいずれかを指定値に設定する。',
        input_schema: {
            type: 'object',
            properties: {
                target: spriteNameProp,
                param: {type: 'string', enum: ['color', 'saturation', 'brightness', 'transparency']},
                value: {type: 'number'}
            },
            required: ['target', 'param', 'value']
        }
    },
    {
        name: 'actor_pen_set_size',
        description: 'ペンの太さを設定する（1〜1200）。',
        input_schema: {
            type: 'object',
            properties: {
                target: spriteNameProp,
                size: {type: 'number', minimum: 1, maximum: 1200}
            },
            required: ['target', 'size']
        }
    },
    {
        name: 'actor_pen_change_size',
        description: 'ペンの太さを指定量だけ変更する。',
        input_schema: {
            type: 'object',
            properties: {
                target: spriteNameProp,
                size: {type: 'number'}
            },
            required: ['target', 'size']
        }
    },
    {
        name: 'actor_pen_set_shade',
        description: 'ペンのシェード（明度・濃さ）を設定する（レガシー互換、0〜200）。',
        input_schema: {
            type: 'object',
            properties: {
                target: spriteNameProp,
                shade: {type: 'number'}
            },
            required: ['target', 'shade']
        }
    },
    {
        name: 'actor_pen_change_shade',
        description: 'ペンのシェードを指定量だけ変更する（レガシー互換）。',
        input_schema: {
            type: 'object',
            properties: {
                target: spriteNameProp,
                shade: {type: 'number'}
            },
            required: ['target', 'shade']
        }
    },

    // ── 音楽（music 拡張機能） ──────────────────────────────────────
    {
        name: 'actor_play_note',
        description: '指定した MIDI ノート番号（0〜127）を指定拍数鳴らす。',
        input_schema: {
            type: 'object',
            properties: {
                note: {type: 'integer', minimum: 0, maximum: 127, description: 'MIDI ノート番号（60 = 中央 C）'},
                beats: {type: 'number', minimum: 0, description: '拍数'}
            },
            required: ['note', 'beats']
        }
    },
    {
        name: 'actor_play_drum',
        description: '指定したドラム（1〜18）を指定拍数鳴らす。',
        input_schema: {
            type: 'object',
            properties: {
                drum: {type: 'integer', minimum: 1, maximum: 18},
                beats: {type: 'number', minimum: 0}
            },
            required: ['drum', 'beats']
        }
    },
    {
        name: 'actor_rest_for_beats',
        description: '指定した拍数、休符（無音）を入れる。',
        input_schema: {
            type: 'object',
            properties: {beats: {type: 'number', minimum: 0}},
            required: ['beats']
        }
    },
    {
        name: 'actor_set_instrument',
        description: '楽器を切り替える（1〜21: ピアノ、ギターなど）。',
        input_schema: {
            type: 'object',
            properties: {instrument: {type: 'integer', minimum: 1, maximum: 21}},
            required: ['instrument']
        }
    },
    {
        name: 'actor_set_tempo',
        description: 'テンポ（BPM）を設定する。',
        input_schema: {
            type: 'object',
            properties: {tempo: {type: 'number', minimum: 20, maximum: 500}},
            required: ['tempo']
        }
    },
    {
        name: 'actor_change_tempo',
        description: 'テンポを指定量だけ変更する。',
        input_schema: {
            type: 'object',
            properties: {tempo: {type: 'number'}},
            required: ['tempo']
        }
    },

    // ── テキスト読み上げ（text2speech 拡張機能） ───────────────────
    {
        name: 'actor_speak',
        description: '指定したスプライトに文字列を読み上げさせる（音声合成、話しながら待つ）。',
        input_schema: {
            type: 'object',
            properties: {
                target: spriteNameProp,
                words: {type: 'string', description: '読み上げる文字列'}
            },
            required: ['target', 'words']
        }
    },
    {
        name: 'actor_set_voice',
        description: '音声合成の声質を設定する（alto / tenor / squeak / giant / kitten など）。',
        input_schema: {
            type: 'object',
            properties: {
                target: spriteNameProp,
                voice: {type: 'string'}
            },
            required: ['target', 'voice']
        }
    },
    {
        name: 'actor_set_speech_language',
        description: '音声合成の言語を設定する（"en" / "ja" / "zh" など）。',
        input_schema: {
            type: 'object',
            properties: {
                target: spriteNameProp,
                language: {type: 'string'}
            },
            required: ['target', 'language']
        }
    },

    // ── 翻訳（translate 拡張機能） ──────────────────────────────────
    {
        name: 'actor_translate',
        description: '指定した文字列を指定言語に翻訳する（外部 API 呼び出し、結果は同期的に返るまで Promise）。',
        input_schema: {
            type: 'object',
            properties: {
                words: {type: 'string', description: '翻訳元の文字列'},
                language: {type: 'string', description: '翻訳先の言語（"en" / "ja" / "zh" / "es" など）'}
            },
            required: ['words', 'language']
        }
    },
    {
        name: 'actor_get_viewer_language',
        description: 'プロジェクト閲覧者の言語（ブラウザの言語）を取得する。',
        input_schema: {type: 'object', properties: {}}
    },

    // ── 拡張機能の明示的有効化 ─────────────────────────────────────
    {
        name: 'actor_ensure_extension',
        description: 'pen / music / text2speech / translate 拡張を明示的に有効化する。' +
            '他の拡張ツール（actor_pen_* など）を使う前に呼ぶと、拡張読み込みと primitive 登録が確実に行われる。' +
            '既に読み込まれている場合は no-op で即座に返す。',
        input_schema: {
            type: 'object',
            properties: {
                extension_id: {
                    type: 'string',
                    enum: ['pen', 'music', 'text2speech', 'translate'],
                    description: '有効化する拡張の ID'
                }
            },
            required: ['extension_id']
        }
    }
];

// 工具名の集合（用于验证 / 过滤 / 测试）
export const RUNTIME_TOOL_NAMES = new Set(RUNTIME_TOOLS.map(t => t.name));

// 工具输入生成中（streaming 中）的 UI 进度标签
export const runtimeDraftingLabel = (name, lang = 'ja') => {
    const ja = {
        actor_get_state: '状態を確認しています',
        actor_list_sprites: 'スプライトを列挙しています',
        actor_move: '移動しています',
        actor_turn: '回転しています',
        actor_set_position: '位置を設定しています',
        actor_set_direction: '向きを設定しています',
        actor_set_size: '大きさを変えています',
        actor_set_costume: 'コスチュームを切り替えています',
        actor_set_visible: '表示を切り替えています',
        actor_set_layer: 'レイヤーを変更しています',
        actor_say: 'セリフを言わせています',
        actor_think: '考えさせています',
        actor_stop_speaking: '吹き出しを消しています',
        actor_glide: '滑らかに移動しています',
        actor_point_towards: '向きを変えています',
        actor_go_to: '移動しています',
        actor_add_sprite: 'スプライトを追加しています',
        actor_delete_sprite: 'スプライトを削除しています',
        actor_rename_sprite: '名前を変更しています',
        actor_clone_sprite: 'スプライトを複製しています',
        actor_add_costume: 'コスチュームを追加しています',
        actor_add_sound: '音を追加しています',
        actor_add_backdrop: '背景を追加しています',
        actor_start_project: 'プロジェクトを実行しています',
        actor_stop_project: 'プロジェクトを停止しています',
        default: '次の操作を準備しています'
    };
    const en = {
        actor_get_state: 'Checking state',
        actor_list_sprites: 'Listing sprites',
        actor_move: 'Moving',
        actor_turn: 'Turning',
        actor_set_position: 'Setting position',
        actor_set_direction: 'Setting direction',
        actor_set_size: 'Changing size',
        actor_set_costume: 'Switching costume',
        actor_set_visible: 'Toggling visibility',
        actor_set_layer: 'Changing layer',
        actor_say: 'Saying',
        actor_think: 'Thinking',
        actor_stop_speaking: 'Clearing bubble',
        actor_glide: 'Gliding',
        actor_point_towards: 'Pointing',
        actor_go_to: 'Going to',
        actor_add_sprite: 'Adding sprite',
        actor_delete_sprite: 'Deleting sprite',
        actor_rename_sprite: 'Renaming',
        actor_clone_sprite: 'Cloning sprite',
        actor_add_costume: 'Adding costume',
        actor_add_sound: 'Adding sound',
        actor_add_backdrop: 'Adding backdrop',
        actor_start_project: 'Running project',
        actor_stop_project: 'Stopping project',
        default: 'Preparing next action'
    };
    const zh = {
        actor_get_state: '正在检查状态',
        actor_list_sprites: '正在列出角色',
        actor_move: '正在移动',
        actor_turn: '正在旋转',
        actor_set_position: '正在设置位置',
        actor_set_direction: '正在设置方向',
        actor_set_size: '正在改变大小',
        actor_set_costume: '正在切换造型',
        actor_set_visible: '正在切换显示',
        actor_set_layer: '正在改变图层',
        actor_say: '正在说话',
        actor_think: '正在思考',
        actor_stop_speaking: '正在清除气泡',
        actor_glide: '正在滑行',
        actor_point_towards: '正在指向',
        actor_go_to: '正在移动到',
        actor_add_sprite: '正在添加角色',
        actor_delete_sprite: '正在删除角色',
        actor_rename_sprite: '正在重命名',
        actor_clone_sprite: '正在克隆角色',
        actor_add_costume: '正在添加造型',
        actor_add_sound: '正在添加声音',
        actor_add_backdrop: '正在添加背景',
        actor_start_project: '正在运行项目',
        actor_stop_project: '正在停止项目',
        default: '正在准备下一个操作'
    };
    if (lang === 'en') return en[name] || en.default;
    if (lang === 'zh') return zh[name] || zh.default;
    return ja[name] || ja.default;
};

// 工具执行摘要（聊天 UI 显示）
export const summarizeActorToolCall = (name, input, lang = 'ja') => {
    const target = (input && input.target) || '';
    if (lang === 'en') {
        switch (name) {
        case 'actor_get_state':
            return input && input.target ? `Get state: ${target}` : 'Get state (all)';
        case 'actor_list_sprites': return 'List sprites';
        case 'actor_move': return `Move ${target} (${input.dx}, ${input.dy})`;
        case 'actor_turn': return `Turn ${target} ${input.degrees}°`;
        case 'actor_set_position': return `Set ${target} → (${input.x}, ${input.y})`;
        case 'actor_set_direction': return `Set ${target} direction → ${input.direction}°`;
        case 'actor_set_size': return `Set ${target} size → ${input.size}%`;
        case 'actor_set_costume': return `Switch ${target} costume → ${input.costume}`;
        case 'actor_set_visible': return `${input.visible ? 'Show' : 'Hide'} ${target}`;
        case 'actor_set_layer': return `${target} → ${input.layer}`;
        case 'actor_say': return `${target} says "${input.text}"`;
        case 'actor_think': return `${target} thinks "${input.text}"`;
        case 'actor_stop_speaking': return `Clear bubble (${target})`;
        case 'actor_glide': return `Glide ${target} → (${input.x}, ${input.y}) in ${input.secs}s`;
        case 'actor_point_towards': return `Point ${target} towards ${JSON.stringify(input.towards)}`;
        case 'actor_go_to': return `Move ${target} → ${JSON.stringify(input.destination)}`;
        case 'actor_add_sprite': return `Add sprite: ${input.name}`;
        case 'actor_delete_sprite': return `Delete sprite: ${target}`;
        case 'actor_rename_sprite': return `Rename: ${target} → ${input.new_name}`;
        case 'actor_clone_sprite': return `Clone sprite: ${target}`;
        case 'actor_add_costume': return `Add costume: ${input.costume_name} → ${target}`;
        case 'actor_add_sound': return `Add sound: ${input.sound_name} → ${target}`;
        case 'actor_add_backdrop': return `Add backdrop: ${input.backdrop_name}`;
        case 'actor_start_project': return 'Run project';
        case 'actor_stop_project': return 'Stop project';
        default: return name;
        }
    }
    if (lang === 'zh') {
        switch (name) {
        case 'actor_get_state':
            return input && input.target ? `获取状态: ${target}` : '获取状态（全部）';
        case 'actor_list_sprites': return '列出角色';
        case 'actor_move': return `移动 ${target} (${input.dx}, ${input.dy})`;
        case 'actor_turn': return `旋转 ${target} ${input.degrees}°`;
        case 'actor_set_position': return `设置 ${target} → (${input.x}, ${input.y})`;
        case 'actor_set_direction': return `设置 ${target} 方向 → ${input.direction}°`;
        case 'actor_set_size': return `设置 ${target} 大小 → ${input.size}%`;
        case 'actor_set_costume': return `切换 ${target} 造型 → ${input.costume}`;
        case 'actor_set_visible': return `${input.visible ? '显示' : '隐藏'} ${target}`;
        case 'actor_set_layer': return `${target} → ${input.layer}`;
        case 'actor_say': return `${target} 说 "${input.text}"`;
        case 'actor_think': return `${target} 想 "${input.text}"`;
        case 'actor_stop_speaking': return `清除气泡 (${target})`;
        case 'actor_glide': return `滑行 ${target} → (${input.x}, ${input.y}) 用时 ${input.secs}s`;
        case 'actor_point_towards': return `让 ${target} 面向 ${JSON.stringify(input.towards)}`;
        case 'actor_go_to': return `移动 ${target} → ${JSON.stringify(input.destination)}`;
        case 'actor_add_sprite': return `添加角色: ${input.name}`;
        case 'actor_delete_sprite': return `删除角色: ${target}`;
        case 'actor_rename_sprite': return `重命名: ${target} → ${input.new_name}`;
        case 'actor_clone_sprite': return `克隆角色: ${target}`;
        case 'actor_add_costume': return `添加造型: ${input.costume_name} → ${target}`;
        case 'actor_add_sound': return `添加声音: ${input.sound_name} → ${target}`;
        case 'actor_add_backdrop': return `添加背景: ${input.backdrop_name}`;
        case 'actor_start_project': return '运行项目';
        case 'actor_stop_project': return '停止项目';
        default: return name;
        }
    }
    // ja
    switch (name) {
    case 'actor_get_state':
        return input && input.target ? `状態取得: ${target}` : '状態取得(全スプライト)';
    case 'actor_list_sprites': return 'スプライト一覧';
    case 'actor_move': return `${target} を移動 (${input.dx}, ${input.dy})`;
    case 'actor_turn': return `${target} を回転 ${input.degrees}°`;
    case 'actor_set_position': return `${target} を (${input.x}, ${input.y}) に配置`;
    case 'actor_set_direction': return `${target} の向きを ${input.direction}° に`;
    case 'actor_set_size': return `${target} の大きさを ${input.size}% に`;
    case 'actor_set_costume': return `${target} のコスチュームを ${input.costume} に`;
    case 'actor_set_visible': return `${target} を${input.visible ? '表示' : '非表示'}`;
    case 'actor_set_layer': return `${target} を ${input.layer} に`;
    case 'actor_say': return `${target} が「${input.text}」と言う`;
    case 'actor_think': return `${target} が「${input.text}」と考える`;
    case 'actor_stop_speaking': return `${target} の吹き出しを消す`;
    case 'actor_glide': return `${target} を ${input.secs}秒かけて (${input.x}, ${input.y}) へ滑らかに移動`;
    case 'actor_point_towards': return `${target} を ${JSON.stringify(input.towards)} の方向に向ける`;
    case 'actor_go_to': return `${target} を ${JSON.stringify(input.destination)} へ移動`;
    case 'actor_add_sprite': return `スプライト追加: ${input.name}`;
    case 'actor_delete_sprite': return `スプライト削除: ${target}`;
    case 'actor_rename_sprite': return `名前変更: ${target} → ${input.new_name}`;
    case 'actor_clone_sprite': return `スプライト複製: ${target}`;
    case 'actor_add_costume': return `コスチューム追加: ${input.costume_name} → ${target}`;
    case 'actor_add_sound': return `音追加: ${input.sound_name} → ${target}`;
    case 'actor_add_backdrop': return `背景追加: ${input.backdrop_name}`;
    case 'actor_start_project': return 'プロジェクト実行';
    case 'actor_stop_project': return 'プロジェクト停止';
    default: return name;
    }
};