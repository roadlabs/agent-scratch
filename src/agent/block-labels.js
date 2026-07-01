// opcode → scratchblocks 显示文本的映射
// 参数用 [] 省略表示。实际值不需要（只要能传达区块的形状即可）

const EN = {
    // ---- 事件 ----
    event_whenflagclicked: 'when flag clicked',
    event_whenkeypressed: 'when [space v] key pressed',
    event_whenthisspriteclicked: 'when this sprite clicked',
    event_whenstageclicked: 'when stage clicked',
    event_whenbackdropswitchesto: 'when backdrop switches to [backdrop1 v]',
    event_whengreaterthan: 'when [loudness v] > (10)',
    event_whenbroadcastreceived: 'when I receive [message1 v]',
    event_broadcast: 'broadcast [message1 v]',
    event_broadcastandwait: 'broadcast [message1 v] and wait',

    // ---- 运动 ----
    motion_movesteps: 'move (10) steps',
    motion_turnright: 'turn cw (15) degrees',
    motion_turnleft: 'turn ccw (15) degrees',
    motion_goto: 'go to [random position v]',
    motion_gotoxy: 'go to x: (0) y: (0)',
    motion_glideto: 'glide (1) secs to [random position v]',
    motion_glidesecstoxy: 'glide (1) secs to x: (0) y: (0)',
    motion_pointindirection: 'point in direction (90)',
    motion_pointtowards: 'point towards [mouse-pointer v]',
    motion_changexby: 'change x by (10)',
    motion_setx: 'set x to (0)',
    motion_changeyby: 'change y by (10)',
    motion_sety: 'set y to (0)',
    motion_ifonedgebounce: 'if on edge, bounce',
    motion_setrotationstyle: 'set rotation style [left-right v]',
    motion_xposition: '(x position)',
    motion_yposition: '(y position)',
    motion_direction: '(direction)',

    // ---- 外观 ----
    looks_sayforsecs: 'say [Hello!] for (2) seconds',
    looks_say: 'say [Hello!]',
    looks_thinkforsecs: 'think [Hmm...] for (2) seconds',
    looks_think: 'think [Hmm...]',
    looks_switchcostumeto: 'switch costume to [costume1 v]',
    looks_nextcostume: 'next costume',
    looks_switchbackdropto: 'switch backdrop to [backdrop1 v]',
    looks_nextbackdrop: 'next backdrop',
    looks_changesizeby: 'change size by (10)',
    looks_setsizeto: 'set size to (100) %',
    looks_changeeffectby: 'change [color v] effect by (25)',
    looks_seteffectto: 'set [color v] effect to (0)',
    looks_cleargraphiceffects: 'clear graphic effects',
    looks_show: 'show',
    looks_hide: 'hide',
    looks_gotofrontback: 'go to [front v] layer',
    looks_goforwardbackwardlayers: 'go [forward v] (1) layers',
    looks_costumenumbername: '(costume [number v])',
    looks_backdropnumbername: '(backdrop [number v])',
    looks_size: '(size)',

    // ---- 声音 ----
    sound_playuntildone: 'play sound [Meow v] until done',
    sound_play: 'start sound [Meow v]',
    sound_stopallsounds: 'stop all sounds',
    sound_changeeffectby: 'change [pitch v] effect by (10)',
    sound_seteffectto: 'set [pitch v] effect to (100)',
    sound_cleareffects: 'clear sound effects',
    sound_changevolumeby: 'change volume by (-10)',
    sound_setvolumeto: 'set volume to (100) %',
    sound_volume: '(volume)',

    // ---- 控制 ----
    control_wait: 'wait (1) seconds',
    control_repeat: 'repeat (10)',
    control_forever: 'forever',
    control_if: 'if <> then',
    control_if_else: 'if <> then {} else',
    control_wait_until: 'wait until <>',
    control_repeat_until: 'repeat until <>',
    control_stop: 'stop [all v]',
    control_start_as_clone: 'when I start as a clone',
    control_create_clone_of: 'create clone of [myself v]',
    control_delete_this_clone: 'delete this clone',

    // ---- 侦测 ----
    sensing_touchingobject: '<touching [mouse-pointer v] ?>',
    sensing_touchingcolor: '<touching color [#ff0000] ?>',
    sensing_coloristouchingcolor: '<color [#ff0000] is touching [#0000ff] ?>',
    sensing_distanceto: '(distance to [mouse-pointer v])',
    sensing_askandwait: 'ask [What\'s your name?] and wait',
    sensing_answer: '(answer)',
    sensing_keypressed: '<key [space v] pressed?>',
    sensing_mousedown: '<mouse down?>',
    sensing_mousex: '(mouse x)',
    sensing_mousey: '(mouse y)',
    sensing_setdragmode: 'set drag mode [draggable v]',
    sensing_loudness: '(loudness)',
    sensing_timer: '(timer)',
    sensing_resettimer: 'reset timer',
    sensing_dayssince2000: '(days since 2000)',
    sensing_username: '(username)',

    // ---- 运算 ----
    operator_add: '((1) + (2))',
    operator_subtract: '((1) - (2))',
    operator_multiply: '((1) * (2))',
    operator_divide: '((1) / (2))',
    operator_random: '(pick random (1) to (10))',
    operator_gt: '<(1) > (2)>',
    operator_lt: '<(1) < (2)>',
    operator_equals: '<(1) = (2)>',
    operator_and: '<<> and <>>',
    operator_or: '<<> or <>>',
    operator_not: '<not <>>',
    operator_join: '(join [hello ] [world])',
    operator_letter_of: '(letter (1) of [apple])',
    operator_length: '(length of [apple])',
    operator_contains: '<[apple] contains [a]?>',
    operator_mod: '((10) mod (3))',
    operator_round: '(round (3.4))',
    operator_mathop: '([sqrt v] of (9))',

    // ---- 变量 ----
    data_variable: '(my variable)',
    data_setvariableto: 'set [my variable v] to (0)',
    data_changevariableby: 'change [my variable v] by (1)',
    data_showvariable: 'show variable [my variable v]',
    data_hidevariable: 'hide variable [my variable v]',

    // ---- 列表 ----
    data_listcontents: '(my list)',
    data_addtolist: 'add [thing] to [my list v]',
    data_deleteoflist: 'delete (1) of [my list v]',
    data_deletealloflist: 'delete all of [my list v]',
    data_insertatlist: 'insert [thing] at (1) of [my list v]',
    data_replaceitemoflist: 'replace item (1) of [my list v] with [thing]',
    data_itemoflist: '(item (1) of [my list v])',
    data_itemnumoflist: '(item # of [thing] in [my list v])',
    data_lengthoflist: '(length of [my list v])',
    data_listcontainsitem: '<[my list v] contains [thing]?>',
    data_showlist: 'show list [my list v]',
    data_hidelist: 'hide list [my list v]',

    // ---- 画笔扩展 ----
    pen_clear: 'erase all',
    pen_stamp: 'stamp',
    pen_penDown: 'pen down',
    pen_penUp: 'pen up',
    pen_setPenColorToColor: 'set pen color to [#ff0000]',
    pen_changePenColorParamBy: 'change pen [color v] by (10)',
    pen_setPenColorParamTo: 'set pen [color v] to (50)',
    pen_changePenSizeBy: 'change pen size by (1)',
    pen_setPenSizeTo: 'set pen size to (1)'
};

const JA = {
    // ---- 事件 ----
    event_whenflagclicked: '@greenFlag が押されたとき',
    event_whenkeypressed: '[スペース v] キーが押されたとき',
    event_whenthisspriteclicked: 'このスプライトが押されたとき',
    event_whenstageclicked: 'ステージが押されたとき',
    event_whenbackdropswitchesto: '背景が [backdrop1 v] になったとき',
    event_whengreaterthan: '[音量 v] > (10) のとき',
    event_whenbroadcastreceived: '[メッセージ1 v] を受け取ったとき',
    event_broadcast: '[メッセージ1 v] を送る',
    event_broadcastandwait: '[メッセージ1 v] を送って待つ',

    // ---- 运动 ----
    motion_movesteps: '(10) 歩動かす',
    motion_turnright: '@turnRight (15) 度回す',
    motion_turnleft: '@turnLeft (15) 度回す',
    motion_goto: '[ランダムな位置 v] へ行く',
    motion_gotoxy: 'x座標を (0) 、y座標を (0) にする',
    motion_glideto: '(1) 秒で [ランダムな位置 v] へ行く',
    motion_glidesecstoxy: '(1) 秒でx座標を (0) に、y座標を (0) に変える',
    motion_pointindirection: '(90) 度に向ける',
    motion_pointtowards: '[マウスのポインター v] へ向ける',
    motion_changexby: 'x座標を (10) ずつ変える',
    motion_setx: 'x座標を (0) にする',
    motion_changeyby: 'y座標を (10) ずつ変える',
    motion_sety: 'y座標を (0) にする',
    motion_ifonedgebounce: 'もし端に着いたら、跳ね返る',
    motion_setrotationstyle: '回転方法を [左右のみ v] にする',
    motion_xposition: '(x座標 :: motion)',
    motion_yposition: '(y座標 :: motion)',
    motion_direction: '(向き :: motion)',

    // ---- 外观 ----
    looks_sayforsecs: '[こんにちは！] と (2) 秒言う',
    looks_say: '[こんにちは！] と言う',
    looks_thinkforsecs: '[うーん…] と (2) 秒考える',
    looks_think: '[うーん…] と考える',
    looks_switchcostumeto: 'コスチュームを [コスチューム1 v] にする',
    looks_nextcostume: '次のコスチュームにする',
    looks_switchbackdropto: '背景を [背景1 v] にする',
    looks_nextbackdrop: '次の背景にする :: looks',
    looks_changesizeby: '大きさを (10) ずつ変える',
    looks_setsizeto: '大きさを (100) %にする',
    looks_changeeffectby: '[色 v] の効果を (25) ずつ変える',
    looks_seteffectto: '[色 v] の効果を (0) にする',
    looks_cleargraphiceffects: '画像効果をなくす',
    looks_show: '表示する',
    looks_hide: '隠す',
    looks_gotofrontback: '[前 v] へ移動する',
    looks_goforwardbackwardlayers: '(1) 層 [前 v]',
    looks_costumenumbername: '(コスチュームの [番号 v])',
    looks_backdropnumbername: '(背景の [番号 v])',
    looks_size: '(大きさ :: looks)',

    // ---- 声音 ----
    sound_playuntildone: '終わるまで [ニャー v] の音を鳴らす :: sound',
    sound_play: '[ニャー v] の音を鳴らす :: sound',
    sound_stopallsounds: 'すべての音を止める :: sound',
    sound_changeeffectby: '[ピッチ v] の効果を (10) ずつ変える :: sound',
    sound_seteffectto: '[ピッチ v] の効果を (100) にする :: sound',
    sound_cleareffects: '音の効果をなくす :: sound',
    sound_changevolumeby: '音量を (-10) ずつ変える :: sound',
    sound_setvolumeto: '音量を (100) %にする :: sound',
    sound_volume: '(音量 :: sound)',

    // ---- 控制 ----
    control_wait: '(1) 秒待つ',
    control_repeat: '(10) 回繰り返す',
    control_forever: 'ずっと',
    control_if: 'もし <> なら',
    control_if_else: 'もし <> なら {} でなければ',
    control_wait_until: '<> まで待つ',
    control_repeat_until: '<> まで繰り返す',
    control_stop: ' [すべてを止める v]',
    control_start_as_clone: 'クローンされたとき',
    control_create_clone_of: '[自分自身 v] のクローンを作る',
    control_delete_this_clone: 'このクローンを削除する',

    // ---- 侦测 ----
    sensing_touchingobject: '<[マウスのポインター v] に触れた>',
    sensing_touchingcolor: '<[#ff0000] 色に触れた>',
    sensing_coloristouchingcolor: '<[#ff0000] 色が [#0000ff] 色に触れた>',
    sensing_distanceto: '([マウスのポインター v] までの距離)',
    sensing_askandwait: '[名前はなんですか？] と聞いて待つ',
    sensing_answer: '(答え)',
    sensing_keypressed: '<[スペース v] キーが押された>',
    sensing_mousedown: '<マウスが押された>',
    sensing_mousex: '(マウスのx座標)',
    sensing_mousey: '(マウスのy座標)',
    sensing_setdragmode: 'ドラッグ [できる v] ようにする',
    sensing_loudness: '(音量 :: sensing)',
    sensing_timer: '(タイマー)',
    sensing_resettimer: 'タイマーをリセット',
    sensing_dayssince2000: '(2000年からの日数)',
    sensing_username: '(ユーザー名)',

    // ---- 运算 ----
    operator_add: '((1) + (2))',
    operator_subtract: '((1) - (2))',
    operator_multiply: '((1) * (2))',
    operator_divide: '((1) / (2))',
    operator_random: '((1) から (10) までの乱数)',
    operator_gt: '<(1) > (2)>',
    operator_lt: '<(1) < (2)>',
    operator_equals: '<(1) = (2)>',
    operator_and: '<<> かつ <>>',
    operator_or: '<<> または <>>',
    operator_not: '<() ではない>',
    operator_join: '([こんにちは ] と [世界])',
    operator_letter_of: '([りんご] の (1) 番目の文字)',
    operator_length: '([りんご] の長さ)',
    operator_contains: '<[りんご] に [り] が含まれる>',
    operator_mod: '((10) を (3) で割った余り)',
    operator_round: '((3.4) を四捨五入)',
    operator_mathop: '([sqrt v] の (9))',

    // ---- 变量 ----
    data_variable: '(変数)',
    data_setvariableto: '[変数 v] を (0) にする',
    data_changevariableby: '[変数 v] を (1) ずつ変える',
    data_showvariable: '変数 [変数 v] を表示する',
    data_hidevariable: '変数 [変数 v] を隠す',

    // ---- 列表 ----
    data_listcontents: '(リスト)',
    data_addtolist: '[もの] を [リスト v] に追加する',
    data_deleteoflist: '[リスト v] の (1) 番目を削除する',
    data_deletealloflist: '[リスト v] のすべてを削除する',
    data_insertatlist: '[リスト v] の (1) 番目に [もの] を挿入する',
    data_replaceitemoflist: '[リスト v] の (1) 番目を [もの] で置き換える',
    data_itemoflist: '([リスト v] の (1) 番目)',
    data_itemnumoflist: '([リスト v] の中の [もの] の場所)',
    data_lengthoflist: '([リスト v] の長さ)',
    data_listcontainsitem: '<[リスト v] に [もの] が含まれる>',
    data_showlist: 'リスト [リスト v] を表示する',
    data_hidelist: 'リスト [リスト v] を隠す',

    // ---- 画笔扩展 ----
    pen_clear: '全部消す',
    pen_stamp: 'スタンプ',
    pen_penDown: 'ペンを下ろす',
    pen_penUp: 'ペンを上げる',
    pen_setPenColorToColor: 'ペンの色を [#ff0000] にする',
    pen_changePenColorParamBy: 'ペンの [色 v] を (10) ずつ変える',
    pen_setPenColorParamTo: 'ペンの [色 v] を (50) にする',
    pen_changePenSizeBy: 'ペンの太さを (1) ずつ変える',
    pen_setPenSizeTo: 'ペンの太さを (1) にする'
};

export const BLOCK_LABELS = EN;
export const BLOCK_LABELS_JA = JA;

const ZH = {
    // ---- 事件 ----
    event_whenflagclicked: '当绿旗被点击',
    event_whenkeypressed: '当按下 [空格 v] 键',
    event_whenthisspriteclicked: '当角色被点击',
    event_whenstageclicked: '当舞台被点击',
    event_whenbackdropswitchesto: '当背景切换到 [backdrop1 v]',
    event_whengreaterthan: '当 [音量 v] > (10)',
    event_whenbroadcastreceived: '当接收到 [消息1 v]',
    event_broadcast: '广播 [消息1 v]',
    event_broadcastandwait: '广播 [消息1 v] 并等待',

    // ---- 运动 ----
    motion_movesteps: '移动 (10) 步',
    motion_turnright: '右转 (15) 度',
    motion_turnleft: '左转 (15) 度',
    motion_goto: '移到 [随机位置 v]',
    motion_gotoxy: '移到 x: (0) y: (0)',
    motion_glideto: '在 (1) 秒内滑到 [随机位置 v]',
    motion_glidesecstoxy: '在 (1) 秒内滑到 x: (0) y: (0)',
    motion_pointindirection: '面向 (90) 度',
    motion_pointtowards: '面向 [鼠标指针 v]',
    motion_changexby: '将 x 增加 (10)',
    motion_setx: '将 x 设为 (0)',
    motion_changeyby: '将 y 增加 (10)',
    motion_sety: '将 y 设为 (0)',
    motion_ifonedgebounce: '碰到边缘就反弹',
    motion_setrotationstyle: '将旋转方式设为 [左右翻转 v]',
    motion_xposition: '(x 坐标)',
    motion_yposition: '(y 坐标)',
    motion_direction: '(方向)',

    // ---- 外观 ----
    looks_sayforsecs: '说 [你好！] (2) 秒',
    looks_say: '说 [你好！]',
    looks_thinkforsecs: '思考 [嗯……] (2) 秒',
    looks_think: '思考 [嗯……]',
    looks_switchcostumeto: '将造型切换为 [造型1 v]',
    looks_nextcostume: '下一个造型',
    looks_switchbackdropto: '将背景切换为 [背景1 v]',
    looks_nextbackdrop: '下一个背景',
    looks_changesizeby: '将大小增加 (10)',
    looks_setsizeto: '将大小设为 (100) %',
    looks_changeeffectby: '将 [颜色 v] 特效增加 (25)',
    looks_seteffectto: '将 [颜色 v] 特效设为 (0)',
    looks_cleargraphiceffects: '清除图形特效',
    looks_show: '显示',
    looks_hide: '隐藏',
    looks_gotofrontback: '移到最 [前 v] 层',
    looks_goforwardbackwardlayers: '将 (1) 层 [前 v]',
    looks_costumenumbername: '(造型 [编号 v])',
    looks_backdropnumbername: '(背景 [编号 v])',
    looks_size: '(大小)',

    // ---- 声音 ----
    sound_playuntildone: '播放声音 [喵 v] 等待播完',
    sound_play: '播放声音 [喵 v]',
    sound_stopallsounds: '停止所有声音',
    sound_changeeffectby: '将 [音调 v] 特效增加 (10)',
    sound_seteffectto: '将 [音调 v] 特效设为 (100)',
    sound_cleareffects: '清除声音特效',
    sound_changevolumeby: '将音量增加 (-10)',
    sound_setvolumeto: '将音量设为 (100) %',
    sound_volume: '(音量)',

    // ---- 控制 ----
    control_wait: '等待 (1) 秒',
    control_repeat: '重复 (10) 次',
    control_forever: '重复执行',
    control_if: '如果 <> 那么',
    control_if_else: '如果 <> 那么 {} 否则',
    control_wait_until: '等待 <>',
    control_repeat_until: '重复直到 <>',
    control_stop: '停止 [全部 v]',
    control_start_as_clone: '当作为克隆体启动',
    control_create_clone_of: '克隆 [自己 v]',
    control_delete_this_clone: '删除此克隆体',

    // ---- 侦测 ----
    sensing_touchingobject: '<碰到 [鼠标指针 v] ?>',
    sensing_touchingcolor: '<碰到颜色 [#ff0000] ?>',
    sensing_coloristouchingcolor: '<颜色 [#ff0000] 碰到 [#0000ff] ?>',
    sensing_distanceto: '([鼠标指针 v] 的距离)',
    sensing_askandwait: '询问 [你叫什么名字？] 并等待',
    sensing_answer: '(答案)',
    sensing_keypressed: '<按下 [空格 v] 键?>',
    sensing_mousedown: '<鼠标按下?>',
    sensing_mousex: '(鼠标 x)',
    sensing_mousey: '(鼠标 y)',
    sensing_setdragmode: '将拖动模式设为 [可拖动 v]',
    sensing_loudness: '(响度)',
    sensing_timer: '(计时器)',
    sensing_resettimer: '重置计时器',
    sensing_dayssince2000: '(2000年以来的天数)',
    sensing_username: '(用户名)',

    // ---- 运算 ----
    operator_add: '((1) + (2))',
    operator_subtract: '((1) - (2))',
    operator_multiply: '((1) * (2))',
    operator_divide: '((1) / (2))',
    operator_random: '(随机取数 (1) 到 (10))',
    operator_gt: '<(1) > (2)>',
    operator_lt: '<(1) < (2)>',
    operator_equals: '<(1) = (2)>',
    operator_and: '<<> 且 <>>',
    operator_or: '<<> 或 <>>',
    operator_not: '<非 <>>',
    operator_join: '([你好 ] 和 [世界])',
    operator_letter_of: '([苹果] 的 (1) 的字符)',
    operator_length: '([苹果] 的长度)',
    operator_contains: '<[苹果] 包含 [a]?>',
    operator_mod: '((10) 除以 (3) 的余数)',
    operator_round: '(四舍五入 (3.4))',
    operator_mathop: '([平方根 v] 的 (9))',

    // ---- 变量 ----
    data_variable: '(我的变量)',
    data_setvariableto: '将 [我的变量 v] 设为 (0)',
    data_changevariableby: '将 [我的变量 v] 增加 (1)',
    data_showvariable: '显示变量 [我的变量 v]',
    data_hidevariable: '隐藏变量 [我的变量 v]',

    // ---- 列表 ----
    data_listcontents: '(我的列表)',
    data_addtolist: '将 [东西] 加入 [我的列表 v]',
    data_deleteoflist: '删除 [我的列表 v] 的 (1)',
    data_deletealloflist: '删除 [我的列表 v] 的全部',
    data_insertatlist: '在 [我的列表 v] 的 (1) 插入 [东西]',
    data_replaceitemoflist: '将 [我的列表 v] 的 (1) 替换为 [东西]',
    data_itemoflist: '([我的列表 v] 的 (1))',
    data_itemnumoflist: '([我的列表 v] 中 [东西] 的位置)',
    data_lengthoflist: '([我的列表 v] 的长度)',
    data_listcontainsitem: '<[我的列表 v] 包含 [东西]?>',
    data_showlist: '显示列表 [我的列表 v]',
    data_hidelist: '隐藏列表 [我的列表 v]',

    // ---- 画笔扩展 ----
    pen_clear: '全部擦除',
    pen_stamp: '图章',
    pen_penDown: '落笔',
    pen_penUp: '抬笔',
    pen_setPenColorToColor: '将画笔颜色设为 [#ff0000]',
    pen_changePenColorParamBy: '将画笔 [颜色 v] 增加 (10)',
    pen_setPenColorParamTo: '将画笔 [颜色 v] 设为 (50)',
    pen_changePenSizeBy: '将画笔粗细增加 (1)',
    pen_setPenSizeTo: '将画笔粗细设为 (1)'
};

export const BLOCK_LABELS_ZH = ZH;

export const getBlockLabel = (opcode, lang) => {
    if (lang && lang.startsWith('ja')) {
        return JA[opcode] || EN[opcode];
    }
    if (lang && lang.startsWith('zh')) {
        return ZH[opcode] || EN[opcode];
    }
    return EN[opcode];
};

// ---- 日语区块名 → opcode 的逆引き ----
// 即使 AI 不是用 opcode 而是使用日语名称（「ずっと」「10歩動かす」等）来描述区块，
// 为了也能转换为区块图像，从 JA 标签自动生成逆引き字典。
//（对于不遵守"请用 opcode 书写"指示的模型的逻辑侧补救）

// 吸收书写差异：去除图标引用・参数占位符・数字・空白・标点符号
const normalizeJaName = s => String(s)
    .replace(/@\w+/g, '')          // @greenFlag 等图标引用
    .replace(/\[[^\]]*\]/g, '')    // [スペース v] 等菜单
    .replace(/\([^)]*\)/g, '')     // (10) 等参数
    .replace(/[0-9０-９]+/g, '')   // 写在标签外的数字（「10歩動かす」等）
    .replace(/[\s　、。，．,.!?！？「」『』:：;；・〜~ー-]/g, '')
    .toLowerCase();

// 模型常写的言い換え（与规范化后的 JA 标签不一致的表达）
const JA_NAME_ALIASES = {
    '緑の旗がクリックされたとき': 'event_whenflagclicked',
    '旗がクリックされたとき': 'event_whenflagclicked',
    '緑の旗が押されたとき': 'event_whenflagclicked',
    'スペースキーが押されたとき': 'event_whenkeypressed',
    'もし端についたら跳ね返る': 'motion_ifonedgebounce',
    '端についたら跳ね返る': 'motion_ifonedgebounce',
    '端に着いたら跳ね返る': 'motion_ifonedgebounce',
    'ずっと繰り返す': 'control_forever',
    'クローンされたとき': 'control_start_as_clone',
    '自分自身のクローンを作る': 'control_create_clone_of'
};

const JA_NAME_TO_OPCODE = (() => {
    const map = {};
    // 优先注册别名
    for (const [name, opcode] of Object.entries(JA_NAME_ALIASES)) {
        map[normalizeJaName(name)] = opcode;
    }
    // 从 JA 标签自动生成（先到先得）
    for (const [opcode, label] of Object.entries(JA)) {
        const key = normalizeJaName(label);
        if (key.length >= 2 && !map[key]) map[key] = opcode;
    }
    return map;
})();

// 从类似日语区块名的字符串查找 opcode（无匹配则返回 null）
export const findOpcodeByJaName = text => {
    const key = normalizeJaName(text);
    return (key && JA_NAME_TO_OPCODE[key]) || null;
};

// ---- 中文区块名 → opcode 的逆引き（与 JA 同款机制） ----
// normalizeJaName 的规则（去除图标引用/菜单/参数/数字/标点）对中文同样适用。
// 例如 "移动 10 步" → "移动步" → motion_movesteps。

// 模型常写的言い換え（与规范化后的 ZH 标签不一致的表达）
const ZH_NAME_ALIASES = {
    '绿旗被点击': 'event_whenflagclicked',
    '点击绿旗': 'event_whenflagclicked',
    '绿旗被点击时': 'event_whenflagclicked',
    '当绿旗被点击': 'event_whenflagclicked',
    '当按下空格键': 'event_whenkeypressed',
    '按空格键': 'event_whenkeypressed',
    '重复执行': 'control_forever',
    '永远重复': 'control_forever',
    '一直重复': 'control_forever',
    '当作为克隆体启动时': 'control_start_as_clone',
    '作为克隆体启动': 'control_start_as_clone',
    '当克隆启动': 'control_start_as_clone',
    '克隆自己': 'control_create_clone_of',
    '克隆自身': 'control_create_clone_of',
    '移动步': 'motion_movesteps',
    '右转度': 'motion_turnright',
    '左转度': 'motion_turnleft',
    '碰到边缘就反弹': 'motion_ifonedgebounce',
    '说': 'looks_say',
    '思考': 'looks_think',
    '下一个造型': 'looks_nextcostume',
    '下一个背景': 'looks_nextbackdrop',
    '隐藏': 'looks_hide',
    '显示': 'looks_show'
};

const ZH_NAME_TO_OPCODE = (() => {
    const map = {};
    // 优先注册别名
    for (const [name, opcode] of Object.entries(ZH_NAME_ALIASES)) {
        map[normalizeJaName(name)] = opcode;
    }
    // 从 ZH 标签自动生成（先到先得）
    for (const [opcode, label] of Object.entries(ZH)) {
        const key = normalizeJaName(label);
        if (key.length >= 2 && !map[key]) map[key] = opcode;
    }
    return map;
})();

// 从类似中文区块名的字符串查找 opcode（无匹配则返回 null）
export const findOpcodeByZhName = text => {
    const key = normalizeJaName(text);
    return (key && ZH_NAME_TO_OPCODE[key]) || null;
};

// key 是否为 cand 的子序列（保持顺序包含）
// 例: 「回転方法をにする」⊂「回転方法を左右に反転にする」（允许菜单值的插入）
const isSubsequence = (key, cand) => {
    let i = 0;
    for (const ch of cand) {
        if (ch === key[i]) i++;
        if (i === key.length) return true;
    }
    return i === key.length;
};

// 判断"区块图像紧跟的括号注释"是否为同一区块的言い換え。
// 用于避免图像+(相同日语名)的双重显示。
export const isRedundantJaAnnotation = (text, opcode) => {
    if (findOpcodeByJaName(text) === opcode) return true;
    const label = JA[opcode];
    if (!label) return false;
    const key = normalizeJaName(label);
    const cand = normalizeJaName(text);
    if (!key || !cand || key.length < 3) return false;
    if (cand.length > key.length * 3 + 10) return false; // 过长的说明文视为不同物
    return isSubsequence(key, cand);
};
