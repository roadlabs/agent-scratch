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
//
// 国际化：与 tools.js 一致，使用 description_i18n: {ja, en, zh} 描述字段，
// 由 getRuntimeTools(lang) 在请求时解析为 description。

import {localizeSchema} from './tools';

// spriteNameProp 共享很多工具，避免每次都重复相同的 description_i18n
// （localizeSchema 会处理嵌套结构）
const spriteNamePropI18n = {
    type: 'string',
    description_i18n: {
        ja: 'スプライト名（実名。actor_list_sprites で確認）',
        en: 'Sprite name (the actual name; confirm with actor_list_sprites)',
        zh: '角色名（实际名称。可通过 actor_list_sprites 查看）'
    }
};

const xyPropsI18n = {
    x: {
        type: 'number',
        description_i18n: {
            ja: 'ステージ X 座標（-240〜240）',
            en: 'Stage X coordinate (-240 to 240)',
            zh: '舞台 X 坐标（-240 至 240）'
        }
    },
    y: {
        type: 'number',
        description_i18n: {
            ja: 'ステージ Y 座標（-180〜180）',
            en: 'Stage Y coordinate (-180 to 180)',
            zh: '舞台 Y 坐标（-180 至 180）'
        }
    }
};

export const RUNTIME_TOOL_DEFS = [
    // ── 観察（読み取り）──────────────────────────────────────────
    {
        name: 'actor_get_state',
        description_i18n: {
            ja: '全スプライト（または指定スプライト）の現在のランタイム状態を取得する。' +
                '位置・向き・コスチューム・表示・吹き出しを含む。作業開始時および不確かな時に必ず呼ぶこと。',
            en: 'Get the current runtime state of all sprites (or a specified sprite). ' +
                'Includes position, direction, costume, visibility, and speech bubble. ' +
                'Always call this at the start of a task and whenever uncertain.',
            zh: '获取所有角色（或指定角色）的当前运行时状态。' +
                '包括位置、方向、造型、可见性、说话气泡。开始任务时以及不确定时务必先调用此工具。'
        },
        input_schema: {
            type: 'object',
            properties: {
                target: {
                    type: 'string',
                    description_i18n: {
                        ja: '省略時は全スプライト。指定時はそのスプライトのみ',
                        en: 'omit for all sprites; specify a sprite name for that sprite only',
                        zh: '省略时获取所有角色；指定时仅获取该角色'
                    }
                }
            }
        }
    },
    {
        name: 'actor_list_sprites',
        description_i18n: {
            ja: 'プロジェクト内のすべてのスプライト（とステージ）の名前と ID を列挙する。' +
                'get_state より軽量。スプライト名を確認したいときに使う。',
            en: 'List the names and IDs of all sprites (and the stage) in the project. ' +
                'Lighter than get_state. Use when you just need to confirm sprite names.',
            zh: '枚举项目中所有角色（和舞台）的名称和 ID。比 get_state 更轻量。' +
                '当你只想确认角色名时使用。'
        },
        input_schema: {type: 'object', properties: {}}
    },

    // ── 原子動作（書き込み：closed feedback loop で state を返す） ──
    {
        name: 'actor_move',
        description_i18n: {
            ja: 'スプライトを現在位置から相対移動する。向きに関係なく dx / dy の分だけ動く。',
            en: 'Move a sprite relative to its current position by (dx, dy), regardless of facing direction.',
            zh: '将角色相对于当前位置移动（dx, dy），与朝向无关。'
        },
        input_schema: {
            type: 'object',
            properties: {
                target: spriteNamePropI18n,
                dx: {
                    type: 'number',
                    description_i18n: {
                        ja: 'X 方向の移動量（正=右、負=左）',
                        en: 'X-axis movement (positive = right, negative = left)',
                        zh: 'X 方向的移动量（正=右，负=左）'
                    }
                },
                dy: {
                    type: 'number',
                    description_i18n: {
                        ja: 'Y 方向の移動量（正=上、負=下）',
                        en: 'Y-axis movement (positive = up, negative = down)',
                        zh: 'Y 方向的移动量（正=上，负=下）'
                    }
                }
            },
            required: ['target', 'dx', 'dy']
        }
    },
    {
        name: 'actor_turn',
        description_i18n: {
            ja: 'スプライトを現在の方向から相対回転する。',
            en: 'Rotate a sprite relative to its current direction.',
            zh: '将角色相对于当前方向旋转。'
        },
        input_schema: {
            type: 'object',
            properties: {
                target: spriteNamePropI18n,
                degrees: {
                    type: 'number',
                    description_i18n: {
                        ja: '回転量（正=右回り、負=左回り）',
                        en: 'rotation amount (positive = clockwise, negative = counter-clockwise)',
                        zh: '旋转量（正=顺时针，负=逆时针）'
                    }
                }
            },
            required: ['target', 'degrees']
        }
    },
    {
        name: 'actor_set_position',
        description_i18n: {
            ja: 'スプライトを指定した絶対座標に配置する。',
            en: 'Place a sprite at the given absolute coordinates.',
            zh: '将角色放置到指定的绝对坐标。'
        },
        input_schema: {
            type: 'object',
            properties: {target: spriteNamePropI18n, ...xyPropsI18n},
            required: ['target', 'x', 'y']
        }
    },
    {
        name: 'actor_set_direction',
        description_i18n: {
            ja: 'スプライトの向きを絶対値で設定する（90=右、0=上、-90/270=左、180=下）。',
            en: 'Set a sprite\'s direction to an absolute value (90 = right, 0 = up, -90 or 270 = left, 180 = down).',
            zh: '将角色的方向设置为绝对值（90=右，0=上，-90 或 270=左，180=下）。'
        },
        input_schema: {
            type: 'object',
            properties: {
                target: spriteNamePropI18n,
                direction: {
                    type: 'number',
                    description_i18n: {
                        ja: '向き（90=右、0=上、-90=左、180=下）',
                        en: 'direction (90 = right, 0 = up, -90 = left, 180 = down)',
                        zh: '方向（90=右，0=上，-90=左，180=下）'
                    }
                }
            },
            required: ['target', 'direction']
        }
    },
    {
        name: 'actor_set_size',
        description_i18n: {
            ja: 'スプライトの大きさを変更する（100=標準）。',
            en: 'Change a sprite\'s size (100 = standard).',
            zh: '改变角色的大小（100 为标准）。'
        },
        input_schema: {
            type: 'object',
            properties: {
                target: spriteNamePropI18n,
                size: {
                    type: 'number',
                    description_i18n: {
                        ja: '大きさ（パーセント、100が標準）',
                        en: 'size (percentage, 100 is standard)',
                        zh: '大小（百分比，100 为标准）'
                    }
                }
            },
            required: ['target', 'size']
        }
    },
    {
        name: 'actor_set_costume',
        description_i18n: {
            ja: 'スプライトのコスチュームを切り替える（名前またはインデックス）。',
            en: 'Switch a sprite\'s costume (by name or by index).',
            zh: '切换角色的造型（按名称或按索引）。'
        },
        input_schema: {
            type: 'object',
            properties: {
                target: spriteNamePropI18n,
                costume: {
                    oneOf: [
                        {
                            type: 'string',
                            description_i18n: {
                                ja: 'コスチューム名（get_state の costumes 配列で確認）',
                                en: 'costume name (confirm in the costumes array from get_state)',
                                zh: '造型名称（在 get_state 的 costumes 数组中查看）'
                            }
                        },
                        {
                            type: 'integer',
                            description_i18n: {
                                ja: 'コスチュームインデックス',
                                en: 'costume index',
                                zh: '造型索引'
                            }
                        }
                    ]
                }
            },
            required: ['target', 'costume']
        }
    },
    {
        name: 'actor_set_visible',
        description_i18n: {
            ja: 'スプライトの表示・非表示を切り替える。',
            en: 'Toggle a sprite\'s visibility.',
            zh: '切换角色的可见性。'
        },
        input_schema: {
            type: 'object',
            properties: {
                target: spriteNamePropI18n,
                visible: {
                    type: 'boolean',
                    description_i18n: {
                        ja: 'true=表示、false=非表示',
                        en: 'true = show, false = hide',
                        zh: 'true = 显示，false = 隐藏'
                    }
                }
            },
            required: ['target', 'visible']
        }
    },
    {
        name: 'actor_set_layer',
        description_i18n: {
            ja: 'スプライトのレイヤー順序を変更する（"front"=最前面、"back"=最背面）。',
            en: 'Change a sprite\'s layer order ("front" = topmost, "back" = bottommost).',
            zh: '改变角色的图层顺序（"front" = 最上层，"back" = 最下层）。'
        },
        input_schema: {
            type: 'object',
            properties: {
                target: spriteNamePropI18n,
                layer: {type: 'string', enum: ['front', 'back']}
            },
            required: ['target', 'layer']
        }
    },
    {
        name: 'actor_say',
        description_i18n: {
            ja: 'スプライトにセリフを言わせる（吹き出しが出る）。別のセリフを言うまで残る。',
            en: 'Make a sprite say something (a speech bubble appears). The bubble remains until another say/think is called.',
            zh: '让角色说话（出现气泡）。气泡会一直显示，直到调用另一句 say/think。'
        },
        input_schema: {
            type: 'object',
            properties: {
                target: spriteNamePropI18n,
                text: {
                    type: 'string',
                    description_i18n: {
                        ja: 'セリフの内容',
                        en: 'text to say',
                        zh: '要说的话'
                    }
                }
            },
            required: ['target', 'text']
        }
    },
    {
        name: 'actor_think',
        description_i18n: {
            ja: 'スプライトに考えさせる（吹き出しが出る）。別の think を呼ぶまで残る。',
            en: 'Make a sprite think something (a thought bubble appears). The bubble remains until another say/think is called.',
            zh: '让角色思考（出现气泡）。气泡会一直显示，直到调用另一句 say/think。'
        },
        input_schema: {
            type: 'object',
            properties: {
                target: spriteNamePropI18n,
                text: {
                    type: 'string',
                    description_i18n: {
                        ja: '考えの内容',
                        en: 'text to think',
                        zh: '思考的内容'
                    }
                }
            },
            required: ['target', 'text']
        }
    },
    {
        name: 'actor_stop_speaking',
        description_i18n: {
            ja: 'スプライトの吹き出しを消す。',
            en: 'Clear a sprite\'s speech/thought bubble.',
            zh: '清除角色的说话气泡。'
        },
        input_schema: {
            type: 'object',
            properties: {target: spriteNamePropI18n},
            required: ['target']
        }
    },
    {
        name: 'actor_glide',
        description_i18n: {
            ja: '指定秒数かけて滑らかに指定座標へ移動する（その間ループは待機）。',
            en: 'Smoothly move to the given coordinates over the specified number of seconds (the loop waits during this time).',
            zh: '在指定的秒数内平滑移动到指定坐标（在此期间循环会等待）。'
        },
        input_schema: {
            type: 'object',
            properties: {
                target: spriteNamePropI18n,
                ...xyPropsI18n,
                secs: {
                    type: 'number',
                    description_i18n: {
                        ja: '移動にかかる秒数',
                        en: 'duration in seconds',
                        zh: '移动所用的秒数'
                    }
                }
            },
            required: ['target', 'x', 'y', 'secs']
        }
    },
    {
        name: 'actor_point_towards',
        description_i18n: {
            ja: 'スプライトを特定の座標または別のスプライトの方へ向ける。',
            en: 'Point a sprite towards specific coordinates or towards another sprite.',
            zh: '让角色朝向指定坐标或另一个角色。'
        },
        input_schema: {
            type: 'object',
            properties: {
                target: spriteNamePropI18n,
                towards: {
                    type: 'object',
                    description_i18n: {
                        ja: '向ける対象。座標 {x, y} または {sprite: "名前"}',
                        en: 'target to point towards. Coordinates {x, y} or {sprite: "name"}',
                        zh: '朝向的目标。坐标 {x, y} 或 {sprite: "名称"}'
                    },
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
        description_i18n: {
            ja: 'スプライトを別のスプライトの位置／マウス／座標へ瞬時に移動する。',
            en: 'Instantly move a sprite to another sprite\'s position, the mouse, or specific coordinates.',
            zh: '将角色瞬间移动到另一个角色的位置、鼠标或指定坐标。'
        },
        input_schema: {
            type: 'object',
            properties: {
                target: spriteNamePropI18n,
                destination: {
                    description_i18n: {
                        ja: '移動先。文字列 "mouse-pointer"、スプライト名、または座標 {x, y}',
                        en: 'destination. String "mouse-pointer", a sprite name, or coordinates {x, y}',
                        zh: '目的地。字符串 "mouse-pointer"、角色名或坐标 {x, y}'
                    },
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
        description_i18n: {
            ja: 'Scratch 標準ライブラリから新しいスプライトを追加する。',
            en: 'Add a new sprite from the Scratch standard library.',
            zh: '从 Scratch 标准库中添加一个新角色。'
        },
        input_schema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description_i18n: {
                        ja: 'ライブラリ上のスプライト名（例: Dog2, Ball）',
                        en: 'sprite name in the library (e.g. Dog2, Ball)',
                        zh: '库中的角色名（例如 Dog2、Ball）'
                    }
                }
            },
            required: ['name']
        }
    },
    {
        name: 'actor_delete_sprite',
        description_i18n: {
            ja: 'スプライトを削除する（ステージは削除不可）。',
            en: 'Delete a sprite (the stage cannot be deleted).',
            zh: '删除一个角色（舞台不能删除）。'
        },
        input_schema: {
            type: 'object',
            properties: {target: spriteNamePropI18n},
            required: ['target']
        }
    },
    {
        name: 'actor_rename_sprite',
        description_i18n: {
            ja: 'スプライトの名前を変更する（ステージは不可）。',
            en: 'Rename a sprite (the stage cannot be renamed).',
            zh: '重命名一个角色（舞台不能重命名）。'
        },
        input_schema: {
            type: 'object',
            properties: {
                target: spriteNamePropI18n,
                new_name: {
                    type: 'string',
                    description_i18n: {
                        ja: '新しい名前',
                        en: 'new name',
                        zh: '新的名称'
                    }
                }
            },
            required: ['target', 'new_name']
        }
    },
    {
        name: 'actor_clone_sprite',
        description_i18n: {
            ja: '指定したスプライトを複製してスプライト一覧に追加する。',
            en: 'Clone the specified sprite and add it to the sprite list.',
            zh: '克隆指定的角色并添加到角色列表。'
        },
        input_schema: {
            type: 'object',
            properties: {target: spriteNamePropI18n},
            required: ['target']
        }
    },
    {
        name: 'actor_add_costume',
        description_i18n: {
            ja: 'ライブラリからコスチュームをスプライトに追加する。',
            en: 'Add a costume from the library to a sprite.',
            zh: '从库中添加一个造型到角色。'
        },
        input_schema: {
            type: 'object',
            properties: {
                target: spriteNamePropI18n,
                costume_name: {
                    type: 'string',
                    description_i18n: {
                        ja: 'ライブラリのコスチューム名',
                        en: 'costume name in the library',
                        zh: '库中的造型名'
                    }
                }
            },
            required: ['target', 'costume_name']
        }
    },
    {
        name: 'actor_add_sound',
        description_i18n: {
            ja: 'ライブラリから音をスプライト（または "Stage"）に追加する。',
            en: 'Add a sound from the library to a sprite (or "Stage").',
            zh: '从库中添加一个声音到角色（或 "Stage"）。'
        },
        input_schema: {
            type: 'object',
            properties: {
                target: spriteNamePropI18n,
                sound_name: {
                    type: 'string',
                    description_i18n: {
                        ja: 'ライブラリの音名（例: Meow, Pop）',
                        en: 'sound name in the library (e.g. Meow, Pop)',
                        zh: '库中的声音名（例如 Meow、Pop）'
                    }
                }
            },
            required: ['target', 'sound_name']
        }
    },
    {
        name: 'actor_add_backdrop',
        description_i18n: {
            ja: 'ライブラリから背景をステージに追加する。',
            en: 'Add a backdrop from the library to the stage.',
            zh: '从库中添加一个背景到舞台。'
        },
        input_schema: {
            type: 'object',
            properties: {
                backdrop_name: {
                    type: 'string',
                    description_i18n: {
                        ja: 'ライブラリの背景名',
                        en: 'backdrop name in the library',
                        zh: '库中的背景名'
                    }
                }
            },
            required: ['backdrop_name']
        }
    },

    // ── 実行制御 ──────────────────────────────────────────────────
    {
        name: 'actor_start_project',
        description_i18n: {
            ja: '緑の旗を押してプロジェクトを実行する。',
            en: 'Click the green flag to run the project.',
            zh: '点击绿旗运行项目。'
        },
        input_schema: {type: 'object', properties: {}}
    },
    {
        name: 'actor_stop_project',
        description_i18n: {
            ja: 'プロジェクトの実行を止める。',
            en: 'Stop the project execution.',
            zh: '停止项目执行。'
        },
        input_schema: {type: 'object', properties: {}}
    },

    // ── 画筆（pen 拡張機能） ────────────────────────────────────────
    {
        name: 'actor_pen_down',
        description_i18n: {
            ja: '指定したスプライトのペンを下ろす（以後、移動すると線が引かれる）。',
            en: 'Put the specified sprite\'s pen down (after this, movement draws a line).',
            zh: '落下指定角色的画笔（此后移动会绘制线条）。'
        },
        input_schema: {
            type: 'object',
            properties: {target: spriteNamePropI18n},
            required: ['target']
        }
    },
    {
        name: 'actor_pen_up',
        description_i18n: {
            ja: '指定したスプライトのペンを上げる（線が引かれなくなる）。',
            en: 'Lift the specified sprite\'s pen (movement no longer draws a line).',
            zh: '抬起指定角色的画笔（移动时不再绘制线条）。'
        },
        input_schema: {
            type: 'object',
            properties: {target: spriteNamePropI18n},
            required: ['target']
        }
    },
    {
        name: 'actor_pen_clear',
        description_i18n: {
            ja: 'ステージ上のすべてのペン痕とスタンプを消去する。',
            en: 'Erase all pen marks and stamps on the stage.',
            zh: '清除舞台上的所有画笔痕迹和图章。'
        },
        input_schema: {type: 'object', properties: {}}
    },
    {
        name: 'actor_pen_stamp',
        description_i18n: {
            ja: '指定したスプライトの現在の姿をステージにスタンプする。',
            en: 'Stamp the specified sprite\'s current appearance onto the stage.',
            zh: '将指定角色当前的外观盖印到舞台上。'
        },
        input_schema: {
            type: 'object',
            properties: {target: spriteNamePropI18n},
            required: ['target']
        }
    },
    {
        name: 'actor_pen_set_color',
        description_i18n: {
            ja: 'ペンの色を設定する（"#rrggbb" 文字列または 0xRRGGBB 整数）。',
            en: 'Set the pen color (a "#rrggbb" string or a 0xRRGGBB integer).',
            zh: '设置画笔颜色（"#rrggbb" 字符串或 0xRRGGBB 整数）。'
        },
        input_schema: {
            type: 'object',
            properties: {
                target: spriteNamePropI18n,
                color: {
                    description_i18n: {
                        ja: '"#ff8800" のような 6桁 hex 文字列、または 0xFF8800 のような整数',
                        en: 'a 6-digit hex string such as "#ff8800", or an integer such as 0xFF8800',
                        zh: '"#ff8800" 这样的 6 位 hex 字符串，或 0xFF8800 这样的整数'
                    },
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
        description_i18n: {
            ja: 'ペンの色相・彩度・明度・透明度のいずれかを指定量だけ変更する。',
            en: 'Change one of the pen\'s hue / saturation / brightness / transparency by the given amount.',
            zh: '将画笔的色相/饱和度/亮度/透明度之一改变指定量。'
        },
        input_schema: {
            type: 'object',
            properties: {
                target: spriteNamePropI18n,
                param: {type: 'string', enum: ['color', 'saturation', 'brightness', 'transparency']},
                value: {type: 'number'}
            },
            required: ['target', 'param', 'value']
        }
    },
    {
        name: 'actor_pen_set_color_param',
        description_i18n: {
            ja: 'ペンの色相・彩度・明度・透明度のいずれかを指定値に設定する。',
            en: 'Set one of the pen\'s hue / saturation / brightness / transparency to the given value.',
            zh: '将画笔的色相/饱和度/亮度/透明度之一设置为指定值。'
        },
        input_schema: {
            type: 'object',
            properties: {
                target: spriteNamePropI18n,
                param: {type: 'string', enum: ['color', 'saturation', 'brightness', 'transparency']},
                value: {type: 'number'}
            },
            required: ['target', 'param', 'value']
        }
    },
    {
        name: 'actor_pen_set_size',
        description_i18n: {
            ja: 'ペンの太さを設定する（1〜1200）。',
            en: 'Set the pen width (1 to 1200).',
            zh: '设置画笔粗细（1 至 1200）。'
        },
        input_schema: {
            type: 'object',
            properties: {
                target: spriteNamePropI18n,
                size: {type: 'number', minimum: 1, maximum: 1200}
            },
            required: ['target', 'size']
        }
    },
    {
        name: 'actor_pen_change_size',
        description_i18n: {
            ja: 'ペンの太さを指定量だけ変更する。',
            en: 'Change the pen width by the given amount.',
            zh: '将画笔粗细改变指定量。'
        },
        input_schema: {
            type: 'object',
            properties: {
                target: spriteNamePropI18n,
                size: {type: 'number'}
            },
            required: ['target', 'size']
        }
    },
    {
        name: 'actor_pen_set_shade',
        description_i18n: {
            ja: 'ペンのシェード（明度・濃さ）を設定する（レガシー互換、0〜200）。',
            en: 'Set the pen shade (legacy, 0 to 200).',
            zh: '设置画笔的色调（遗留兼容，0 至 200）。'
        },
        input_schema: {
            type: 'object',
            properties: {
                target: spriteNamePropI18n,
                shade: {type: 'number'}
            },
            required: ['target', 'shade']
        }
    },
    {
        name: 'actor_pen_change_shade',
        description_i18n: {
            ja: 'ペンのシェードを指定量だけ変更する（レガシー互換）。',
            en: 'Change the pen shade by the given amount (legacy).',
            zh: '将画笔的色调改变指定量（遗留兼容）。'
        },
        input_schema: {
            type: 'object',
            properties: {
                target: spriteNamePropI18n,
                shade: {type: 'number'}
            },
            required: ['target', 'shade']
        }
    },

    // ── 音楽（music 拡張機能） ──────────────────────────────────────
    {
        name: 'actor_play_note',
        description_i18n: {
            ja: '指定した MIDI ノート番号（0〜127）を指定拍数鳴らす。',
            en: 'Play the given MIDI note number (0 to 127) for the given number of beats.',
            zh: '演奏指定的 MIDI 音符编号（0 至 127）指定拍数。'
        },
        input_schema: {
            type: 'object',
            properties: {
                note: {
                    type: 'integer',
                    minimum: 0,
                    maximum: 127,
                    description_i18n: {
                        ja: 'MIDI ノート番号（60 = 中央 C）',
                        en: 'MIDI note number (60 = middle C)',
                        zh: 'MIDI 音符编号（60 = 中央 C）'
                    }
                },
                beats: {
                    type: 'number',
                    minimum: 0,
                    description_i18n: {
                        ja: '拍数',
                        en: 'beats',
                        zh: '拍数'
                    }
                }
            },
            required: ['note', 'beats']
        }
    },
    {
        name: 'actor_play_drum',
        description_i18n: {
            ja: '指定したドラム（1〜18）を指定拍数鳴らす。',
            en: 'Play the given drum (1 to 18) for the given number of beats.',
            zh: '演奏指定的鼓（1 至 18）指定拍数。'
        },
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
        description_i18n: {
            ja: '指定した拍数、休符（無音）を入れる。',
            en: 'Rest for the given number of beats (silence).',
            zh: '休止指定的拍数（无声）。'
        },
        input_schema: {
            type: 'object',
            properties: {beats: {type: 'number', minimum: 0}},
            required: ['beats']
        }
    },
    {
        name: 'actor_set_instrument',
        description_i18n: {
            ja: '楽器を切り替える（1〜21: ピアノ、ギターなど）。',
            en: 'Switch instrument (1 to 21: piano, guitar, etc.).',
            zh: '切换乐器（1 至 21：钢琴、吉他等）。'
        },
        input_schema: {
            type: 'object',
            properties: {instrument: {type: 'integer', minimum: 1, maximum: 21}},
            required: ['instrument']
        }
    },
    {
        name: 'actor_set_tempo',
        description_i18n: {
            ja: 'テンポ（BPM）を設定する。',
            en: 'Set the tempo (BPM).',
            zh: '设置速度（BPM）。'
        },
        input_schema: {
            type: 'object',
            properties: {tempo: {type: 'number', minimum: 20, maximum: 500}},
            required: ['tempo']
        }
    },
    {
        name: 'actor_change_tempo',
        description_i18n: {
            ja: 'テンポを指定量だけ変更する。',
            en: 'Change the tempo by the given amount.',
            zh: '将速度改变指定量。'
        },
        input_schema: {
            type: 'object',
            properties: {tempo: {type: 'number'}},
            required: ['tempo']
        }
    },

    // ── テキスト読み上げ（text2speech 拡張機能） ───────────────────
    {
        name: 'actor_speak',
        description_i18n: {
            ja: '指定したスプライトに文字列を読み上げさせる（音声合成、話しながら待つ）。',
            en: 'Make the specified sprite speak the given text (text-to-speech; the call waits until finished).',
            zh: '让指定角色朗读给定文字（语音合成，会等待朗读完成）。'
        },
        input_schema: {
            type: 'object',
            properties: {
                target: spriteNamePropI18n,
                words: {
                    type: 'string',
                    description_i18n: {
                        ja: '読み上げる文字列',
                        en: 'text to speak',
                        zh: '要朗读的文字'
                    }
                }
            },
            required: ['target', 'words']
        }
    },
    {
        name: 'actor_set_voice',
        description_i18n: {
            ja: '音声合成の声質を設定する（alto / tenor / squeak / giant / kitten など）。',
            en: 'Set the text-to-speech voice (alto / tenor / squeak / giant / kitten etc.).',
            zh: '设置语音合成的音色（alto / tenor / squeak / giant / kitten 等）。'
        },
        input_schema: {
            type: 'object',
            properties: {
                target: spriteNamePropI18n,
                voice: {type: 'string'}
            },
            required: ['target', 'voice']
        }
    },
    {
        name: 'actor_set_speech_language',
        description_i18n: {
            ja: '音声合成の言語を設定する（"en" / "ja" / "zh" など）。',
            en: 'Set the text-to-speech language (e.g. "en", "ja", "zh").',
            zh: '设置语音合成的语言（例如 "en"、"ja"、"zh"）。'
        },
        input_schema: {
            type: 'object',
            properties: {
                target: spriteNamePropI18n,
                language: {type: 'string'}
            },
            required: ['target', 'language']
        }
    },

    // ── 翻訳（translate 拡張機能） ──────────────────────────────────
    {
        name: 'actor_translate',
        description_i18n: {
            ja: '指定した文字列を指定言語に翻訳する（外部 API 呼び出し、結果は同期的に返るまで Promise）。',
            en: 'Translate the given text into the specified language (external API call; the Promise resolves when the result returns).',
            zh: '将指定的文字翻译为指定语言（外部 API 调用，Promise 会在结果返回时 resolve）。'
        },
        input_schema: {
            type: 'object',
            properties: {
                words: {
                    type: 'string',
                    description_i18n: {
                        ja: '翻訳元の文字列',
                        en: 'source text to translate',
                        zh: '原文'
                    }
                },
                language: {
                    type: 'string',
                    description_i18n: {
                        ja: '翻訳先の言語（"en" / "ja" / "zh" / "es" など）',
                        en: 'target language (e.g. "en", "ja", "zh", "es")',
                        zh: '目标语言（例如 "en"、"ja"、"zh"、"es"）'
                    }
                }
            },
            required: ['words', 'language']
        }
    },
    {
        name: 'actor_get_viewer_language',
        description_i18n: {
            ja: 'プロジェクト閲覧者の言語（ブラウザの言語）を取得する。',
            en: 'Get the project viewer\'s language (the browser language).',
            zh: '获取项目浏览者的语言（浏览器语言）。'
        },
        input_schema: {type: 'object', properties: {}}
    },

    // ── 拡張機能の明示的有効化 ─────────────────────────────────────
    {
        name: 'actor_ensure_extension',
        description_i18n: {
            ja: 'pen / music / text2speech / translate 拡張を明示的に有効化する。' +
                '他の拡張ツール（actor_pen_* など）を使う前に呼ぶと、拡張読み込みと primitive 登録が確実に行われる。' +
                '既に読み込まれている場合は no-op で即座に返す。',
            en: 'Explicitly enable the pen / music / text2speech / translate extension. ' +
                'Call this before using extension tools (e.g. actor_pen_*) to ensure the extension and its primitives are registered. ' +
                'If the extension is already loaded, this is a no-op and returns immediately.',
            zh: '显式启用 pen / music / text2speech / translate 扩展。' +
                '在使用扩展工具（如 actor_pen_*）之前调用此工具，可确保扩展及其 primitive 已注册。' +
                '如果已加载，则为 no-op 并立即返回。'
        },
        input_schema: {
            type: 'object',
            properties: {
                extension_id: {
                    type: 'string',
                    enum: ['pen', 'music', 'text2speech', 'translate'],
                    description_i18n: {
                        ja: '有効化する拡張の ID',
                        en: 'ID of the extension to enable',
                        zh: '要启用的扩展 ID'
                    }
                }
            },
            required: ['extension_id']
        }
    }
];

// 工具名的集合（用于验证 / 过滤 / 测试）
export const RUNTIME_TOOL_NAMES = new Set(RUNTIME_TOOL_DEFS.map(t => t.name));

const _runtimeCache = new Map();

/**
 * 获取 lang 语言下的 runtime tools 数组。同一 lang 多次调用返回同一引用。
 * @param {'ja'|'en'|'zh'} lang
 * @returns {Array<object>}
 */
export const getRuntimeTools = lang => {
    if (_runtimeCache.has(lang)) return _runtimeCache.get(lang);
    const arr = RUNTIME_TOOL_DEFS.map(d => ({
        name: d.name,
        description: d.description_i18n[lang] || d.description_i18n.ja,
        input_schema: localizeSchema(d.input_schema, lang)
    }));
    _runtimeCache.set(lang, arr);
    return arr;
};

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
        case 'actor_add_sound': return `添加声音: ${input.sound_name} → ${input.target}`;
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