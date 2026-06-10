// Scratch 3.0 主要 opcode 的参数规格表
//
// args 的值:
//   'number' | 'positive_number' | 'whole_number' | 'integer' | 'angle' |
//   'string' | 'color' | 'boolean' | 'broadcast' |
//   {menu: '<menu opcode>', field: '<field name>', default: '<value>'}
// fields 的值:
//   {} (普通下拉菜单) | {variable: ''} | {variable: 'list'} |
//   {variable: 'broadcast_msg'}
// shape: 'hat' | 'cap' | 'reporter' | 'boolean'（省略时为普通堆栈区块）
// substacks: 1 | 2（C 型区块的内含堆栈数）

// 键名的允许值(event_whenkeypressed / sensing_keypressed)
export const KEY_OPTIONS = [
    'space', 'up arrow', 'down arrow', 'left arrow', 'right arrow', 'enter', 'any',
    ...'abcdefghijklmnopqrstuvwxyz'.split(''),
    ...'0123456789'.split('')
];

const LOOKS_EFFECTS = ['COLOR', 'FISHEYE', 'WHIRL', 'PIXELATE', 'MOSAIC', 'BRIGHTNESS', 'GHOST'];
const SOUND_EFFECTS = ['PITCH', 'PAN'];
const MATHOPS = ['abs', 'floor', 'ceiling', 'sqrt', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'ln', 'log', 'e ^', '10 ^'];
const PEN_COLOR_PARAMS = ['color', 'saturation', 'brightness', 'transparency'];

export const BLOCK_SPECS = {
    // ---- 事件 ----
    event_whenflagclicked: {shape: 'hat'},
    event_whenkeypressed: {shape: 'hat', fields: {KEY_OPTION: {values: KEY_OPTIONS}}},
    event_whenthisspriteclicked: {shape: 'hat'},
    event_whenstageclicked: {shape: 'hat'},
    event_whenbackdropswitchesto: {shape: 'hat', fields: {BACKDROP: {dynamic: 'backdrops'}}},
    event_whengreaterthan: {shape: 'hat', fields: {WHENGREATERTHANMENU: {values: ['LOUDNESS', 'TIMER']}}, args: {VALUE: 'number'}},
    event_whenbroadcastreceived: {shape: 'hat', fields: {BROADCAST_OPTION: {variable: 'broadcast_msg'}}},
    event_broadcast: {args: {BROADCAST_INPUT: 'broadcast'}},
    event_broadcastandwait: {args: {BROADCAST_INPUT: 'broadcast'}},

    // ---- 运动 ----
    motion_movesteps: {args: {STEPS: 'number'}},
    motion_turnright: {args: {DEGREES: 'number'}},
    motion_turnleft: {args: {DEGREES: 'number'}},
    motion_goto: {args: {TO: {menu: 'motion_goto_menu', field: 'TO', default: '_random_', values: ['_random_', '_mouse_'], dynamic: 'sprites'}}},
    motion_gotoxy: {args: {X: 'number', Y: 'number'}},
    motion_glideto: {args: {SECS: 'number', TO: {menu: 'motion_glideto_menu', field: 'TO', default: '_random_', values: ['_random_', '_mouse_'], dynamic: 'sprites'}}},
    motion_glidesecstoxy: {args: {SECS: 'number', X: 'number', Y: 'number'}},
    motion_pointindirection: {args: {DIRECTION: 'angle'}},
    motion_pointtowards: {args: {TOWARDS: {menu: 'motion_pointtowards_menu', field: 'TOWARDS', default: '_mouse_', values: ['_mouse_', '_random_'], dynamic: 'sprites'}}},
    motion_changexby: {args: {DX: 'number'}},
    motion_setx: {args: {X: 'number'}},
    motion_changeyby: {args: {DY: 'number'}},
    motion_sety: {args: {Y: 'number'}},
    motion_ifonedgebounce: {},
    motion_setrotationstyle: {fields: {STYLE: {values: ['left-right', "don't rotate", 'all around']}}},
    motion_xposition: {shape: 'reporter'},
    motion_yposition: {shape: 'reporter'},
    motion_direction: {shape: 'reporter'},

    // ---- 外观 ----
    looks_sayforsecs: {args: {MESSAGE: 'string', SECS: 'number'}},
    looks_say: {args: {MESSAGE: 'string'}},
    looks_thinkforsecs: {args: {MESSAGE: 'string', SECS: 'number'}},
    looks_think: {args: {MESSAGE: 'string'}},
    looks_switchcostumeto: {args: {COSTUME: {menu: 'looks_costume', field: 'COSTUME', default: '', dynamic: 'costumes'}}},
    looks_nextcostume: {},
    looks_switchbackdropto: {args: {BACKDROP: {menu: 'looks_backdrops', field: 'BACKDROP', default: '', values: ['next backdrop', 'previous backdrop', 'random backdrop'], dynamic: 'backdrops'}}},
    looks_nextbackdrop: {},
    looks_changesizeby: {args: {CHANGE: 'number'}},
    looks_setsizeto: {args: {SIZE: 'number'}},
    looks_changeeffectby: {fields: {EFFECT: {values: LOOKS_EFFECTS}}, args: {CHANGE: 'number'}},
    looks_seteffectto: {fields: {EFFECT: {values: LOOKS_EFFECTS}}, args: {VALUE: 'number'}},
    looks_cleargraphiceffects: {},
    looks_show: {},
    looks_hide: {},
    looks_gotofrontback: {fields: {FRONT_BACK: {values: ['front', 'back']}}},
    looks_goforwardbackwardlayers: {fields: {FORWARD_BACKWARD: {values: ['forward', 'backward']}}, args: {NUM: 'integer'}},
    looks_costumenumbername: {shape: 'reporter', fields: {NUMBER_NAME: {values: ['number', 'name']}}},
    looks_backdropnumbername: {shape: 'reporter', fields: {NUMBER_NAME: {values: ['number', 'name']}}},
    looks_size: {shape: 'reporter'},

    // ---- 声音 ----
    sound_playuntildone: {args: {SOUND_MENU: {menu: 'sound_sounds_menu', field: 'SOUND_MENU', default: '', dynamic: 'sounds'}}},
    sound_play: {args: {SOUND_MENU: {menu: 'sound_sounds_menu', field: 'SOUND_MENU', default: '', dynamic: 'sounds'}}},
    sound_stopallsounds: {},
    sound_changeeffectby: {fields: {EFFECT: {values: SOUND_EFFECTS}}, args: {VALUE: 'number'}},
    sound_seteffectto: {fields: {EFFECT: {values: SOUND_EFFECTS}}, args: {VALUE: 'number'}},
    sound_cleareffects: {},
    sound_changevolumeby: {args: {VOLUME: 'number'}},
    sound_setvolumeto: {args: {VOLUME: 'number'}},
    sound_volume: {shape: 'reporter'},

    // ---- 控制 ----
    control_wait: {args: {DURATION: 'positive_number'}},
    control_repeat: {args: {TIMES: 'whole_number'}, substacks: 1},
    control_forever: {substacks: 1, shape: 'cap'},
    control_if: {args: {CONDITION: 'boolean'}, substacks: 1},
    control_if_else: {args: {CONDITION: 'boolean'}, substacks: 2},
    control_wait_until: {args: {CONDITION: 'boolean'}},
    control_repeat_until: {args: {CONDITION: 'boolean'}, substacks: 1},
    control_stop: {fields: {STOP_OPTION: {values: ['all', 'this script', 'other scripts in sprite']}}, shape: 'cap', mutationStop: true},
    control_start_as_clone: {shape: 'hat'},
    control_create_clone_of: {args: {CLONE_OPTION: {menu: 'control_create_clone_of_menu', field: 'CLONE_OPTION', default: '_myself_', values: ['_myself_'], dynamic: 'sprites'}}},
    control_delete_this_clone: {shape: 'cap'},

    // ---- 侦测 ----
    sensing_touchingobject: {shape: 'boolean', args: {TOUCHINGOBJECTMENU: {menu: 'sensing_touchingobjectmenu', field: 'TOUCHINGOBJECTMENU', default: '_mouse_', values: ['_mouse_', '_edge_'], dynamic: 'sprites'}}},
    sensing_touchingcolor: {shape: 'boolean', args: {COLOR: 'color'}},
    sensing_coloristouchingcolor: {shape: 'boolean', args: {COLOR: 'color', COLOR2: 'color'}},
    sensing_distanceto: {shape: 'reporter', args: {DISTANCETOMENU: {menu: 'sensing_distancetomenu', field: 'DISTANCETOMENU', default: '_mouse_', values: ['_mouse_'], dynamic: 'sprites'}}},
    sensing_askandwait: {args: {QUESTION: 'string'}},
    sensing_answer: {shape: 'reporter'},
    sensing_keypressed: {shape: 'boolean', args: {KEY_OPTION: {menu: 'sensing_keyoptions', field: 'KEY_OPTION', default: 'space', values: KEY_OPTIONS}}},
    sensing_mousedown: {shape: 'boolean'},
    sensing_mousex: {shape: 'reporter'},
    sensing_mousey: {shape: 'reporter'},
    sensing_setdragmode: {fields: {DRAG_MODE: {values: ['draggable', 'not draggable']}}},
    sensing_loudness: {shape: 'reporter'},
    sensing_timer: {shape: 'reporter'},
    sensing_resettimer: {},
    sensing_dayssince2000: {shape: 'reporter'},
    sensing_username: {shape: 'reporter'},

    // ---- 运算 ----
    operator_add: {shape: 'reporter', args: {NUM1: 'number', NUM2: 'number'}},
    operator_subtract: {shape: 'reporter', args: {NUM1: 'number', NUM2: 'number'}},
    operator_multiply: {shape: 'reporter', args: {NUM1: 'number', NUM2: 'number'}},
    operator_divide: {shape: 'reporter', args: {NUM1: 'number', NUM2: 'number'}},
    operator_random: {shape: 'reporter', args: {FROM: 'number', TO: 'number'}},
    operator_gt: {shape: 'boolean', args: {OPERAND1: 'string', OPERAND2: 'string'}},
    operator_lt: {shape: 'boolean', args: {OPERAND1: 'string', OPERAND2: 'string'}},
    operator_equals: {shape: 'boolean', args: {OPERAND1: 'string', OPERAND2: 'string'}},
    operator_and: {shape: 'boolean', args: {OPERAND1: 'boolean', OPERAND2: 'boolean'}},
    operator_or: {shape: 'boolean', args: {OPERAND1: 'boolean', OPERAND2: 'boolean'}},
    operator_not: {shape: 'boolean', args: {OPERAND: 'boolean'}},
    operator_join: {shape: 'reporter', args: {STRING1: 'string', STRING2: 'string'}},
    operator_letter_of: {shape: 'reporter', args: {LETTER: 'whole_number', STRING: 'string'}},
    operator_length: {shape: 'reporter', args: {STRING: 'string'}},
    operator_contains: {shape: 'boolean', args: {STRING1: 'string', STRING2: 'string'}},
    operator_mod: {shape: 'reporter', args: {NUM1: 'number', NUM2: 'number'}},
    operator_round: {shape: 'reporter', args: {NUM: 'number'}},
    operator_mathop: {shape: 'reporter', fields: {OPERATOR: {values: MATHOPS}}, args: {NUM: 'number'}},

    // ---- 变量 ----
    data_variable: {shape: 'reporter', fields: {VARIABLE: {variable: ''}}},
    data_setvariableto: {fields: {VARIABLE: {variable: ''}}, args: {VALUE: 'string'}},
    data_changevariableby: {fields: {VARIABLE: {variable: ''}}, args: {VALUE: 'number'}},
    data_showvariable: {fields: {VARIABLE: {variable: ''}}},
    data_hidevariable: {fields: {VARIABLE: {variable: ''}}},

    // ---- 画笔扩展 ----
    pen_clear: {},
    pen_stamp: {},
    pen_penDown: {},
    pen_penUp: {},
    pen_setPenColorToColor: {args: {COLOR: 'color'}},
    pen_changePenColorParamBy: {args: {COLOR_PARAM: {menu: 'pen_menu_colorParam', field: 'colorParam', default: 'color', values: PEN_COLOR_PARAMS}, VALUE: 'number'}},
    pen_setPenColorParamTo: {args: {COLOR_PARAM: {menu: 'pen_menu_colorParam', field: 'colorParam', default: 'color', values: PEN_COLOR_PARAMS}, VALUE: 'number'}},
    pen_changePenSizeBy: {args: {SIZE: 'number'}},
    pen_setPenSizeTo: {args: {SIZE: 'number'}},

    // ---- 列表 ----
    data_listcontents: {shape: 'reporter', fields: {LIST: {variable: 'list'}}},
    data_addtolist: {fields: {LIST: {variable: 'list'}}, args: {ITEM: 'string'}},
    data_deleteoflist: {fields: {LIST: {variable: 'list'}}, args: {INDEX: 'integer'}},
    data_deletealloflist: {fields: {LIST: {variable: 'list'}}},
    data_insertatlist: {fields: {LIST: {variable: 'list'}}, args: {ITEM: 'string', INDEX: 'integer'}},
    data_replaceitemoflist: {fields: {LIST: {variable: 'list'}}, args: {INDEX: 'integer', ITEM: 'string'}},
    data_itemoflist: {shape: 'reporter', fields: {LIST: {variable: 'list'}}, args: {INDEX: 'integer'}},
    data_itemnumoflist: {shape: 'reporter', fields: {LIST: {variable: 'list'}}, args: {ITEM: 'string'}},
    data_lengthoflist: {shape: 'reporter', fields: {LIST: {variable: 'list'}}},
    data_listcontainsitem: {shape: 'boolean', fields: {LIST: {variable: 'list'}}, args: {ITEM: 'string'}},
    data_showlist: {fields: {LIST: {variable: 'list'}}},
    data_hidelist: {fields: {LIST: {variable: 'list'}}}
};

// 表示字面值的 shadow 区块定义（参数类型 → shadow opcode/字段名）
export const LITERAL_SHADOWS = {
    number: {opcode: 'math_number', field: 'NUM'},
    positive_number: {opcode: 'math_positive_number', field: 'NUM'},
    whole_number: {opcode: 'math_whole_number', field: 'NUM'},
    integer: {opcode: 'math_integer', field: 'NUM'},
    angle: {opcode: 'math_angle', field: 'NUM'},
    color: {opcode: 'colour_picker', field: 'COLOUR'},
    string: {opcode: 'text', field: 'TEXT'}
};
