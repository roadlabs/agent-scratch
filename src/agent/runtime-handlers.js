// Runtime Actor 模式的工具处理器。
//
// 设计核心：每个写入动作（move / set_position 等）返回 {ok, action, state}，
// 其中 state 是受影响 sprite 的当前快照。这强制 closed feedback loop：
// LLM 每次动作后必定看到最新状态，无法基于陈旧记忆决策。
//
// scratch-vm API 注意事项（实测后修正）：
//   - RenderedTarget 直接提供的方法只有：setXY / setDirection / setVisible / setSize / setCostume
//     / goToFront / goToBack / getCustomState / setCustomState
//   - 其他常见方法（changeX / changeY / turnRight / goTo / glideTo / pointTowards / say /
//     thinking / moveSteps / goToLayer 等）都不在 RenderedTarget 上！它们是
//     scratch3_motion.js / scratch3_looks.js / scratch3_pen / scratch3_music 等的 block
//     primitive，需要 (args, util) 调用。
//   - 本文件对纯 RenderedTarget 公开 API 的操作（移动/旋转/外观/克隆）直接调用；对
//     primitive 操作（画笔/音乐/朗读/翻译/气泡）通过 runtime.getOpcodeFunction 拿到
//     绑定函数 + 构造最小 util 对象直接调用，绕过 emit event 的脆弱路径。
//
// 国际化：所有 ToolError 通过 error-msgs 的 t() 解析。lang 由 createRuntimeToolHandlers
// 注入，从 runAgent({lang}) 透传。

import {createToolHandlers, ToolError} from './tool-handlers';
import {t as errT} from './error-msgs';

// 通过 name 或 id 查找目标（角色/舞台）。
// 与 tool-handlers.js:50 同款（不导出故在此复制）。
const findTarget = (vm, nameOrId, lang) => {
    if (!nameOrId || /^(stage|ステージ)$/i.test(nameOrId)) {
        const stage = vm.runtime.getTargetForStage();
        if (stage) return stage;
    }
    const byId = vm.runtime.getTargetById(nameOrId);
    if (byId) return byId;
    const byName = vm.runtime.targets.find(
        t => t.isOriginal && t.getName() === nameOrId
    );
    if (!byName) {
        const names = vm.runtime.targets.filter(t => t.isOriginal).map(t => t.getName());
        throw new ToolError(errT('targetNotFound', lang, nameOrId, names));
    }
    return byName;
};

// scratch3_looks.js 中的常量（不能直接 import 因为 blocks 子模块是按需加载）
const BUBBLE_STATE_KEY = 'Scratch.looks';
const SAY_OR_THINK_EVENT = 'SAY';
const DEFAULT_BUBBLE_STATE = {
    drawableId: null,
    onSpriteRight: true,
    skinId: null,
    text: '',
    type: 'say',
    usageId: null
};

// 读取 / 写入气泡状态（内部存储在 target 的 custom state）
const getBubbleState = target => {
    const state = target.getCustomState(BUBBLE_STATE_KEY);
    return state || {...DEFAULT_BUBBLE_STATE};
};
const setBubbleState = (target, state) => {
    target.setCustomState(BUBBLE_STATE_KEY, state);
};

// 单个 target 的运行时状态摘要（用于 closed feedback loop 的 state 回显）
const targetRuntimeSummary = target => {
    const costumes = target.getCostumes();
    const currentCostume = costumes[target.currentCostume];
    const summary = {
        name: target.getName(),
        is_stage: target.isStage,
        costumes: costumes.map(c => c.name),
        current_costume: currentCostume ? currentCostume.name : null,
        sounds: target.getSounds().map(s => s.name)
    };
    if (!target.isStage) {
        const bubble = getBubbleState(target);
        summary.x = Math.round(target.x);
        summary.y = Math.round(target.y);
        summary.direction = Math.round(target.direction);
        summary.size = target.size;
        summary.visible = target.visible;
        // 气泡字段：从 custom state 读取
        summary.saying = bubble.type === 'say' ? bubble.text : null;
        summary.thinking = bubble.type === 'think' ? bubble.text : null;
        summary.bubble = bubble.text ? bubble.type : null;
    }
    return summary;
};

// 所有 target 的快照（用于 actor_get_state 全量返回 + 资产变更后的反馈）
const allTargetsSummary = vm =>
    vm.runtime.targets.filter(t => t.isOriginal).map(targetRuntimeSummary);

// 写入动作的标准返回：{ok, action, target, state}
const withStateEcho = (target, action) => ({
    ok: true,
    action,
    target: target.getName(),
    state: targetRuntimeSummary(target)
});

// 角度转换
const degToRad = d => d * Math.PI / 180;
const radToDeg = r => r * 180 / Math.PI;

// 解决 go_to / point_towards 的 destination 参数 → RenderedTarget / 坐标 / mouse-pointer
const resolveDestination = (vm, input, lang) => {
    if (input === 'mouse-pointer' || input === '_mouse_') {
        const mouse = vm.runtime.ioDevices && vm.runtime.ioDevices.mouse;
        if (!mouse) throw new ToolError(errT('mousePositionUnavailable', lang));
        const x = typeof mouse.getScratchX === 'function' ? mouse.getScratchX() : null;
        const y = typeof mouse.getScratchY === 'function' ? mouse.getScratchY() : null;
        if (x === null || y === null) throw new ToolError(errT('mousePositionUnavailable', lang));
        return {x, y};
    }
    if (typeof input === 'string') return findTarget(vm, input, lang);
    if (typeof input === 'object' && input !== null) {
        if (input.x !== undefined && input.y !== undefined) {
            return {x: input.x, y: input.y};
        }
        if (input.sprite) return findTarget(vm, input.sprite, lang);
    }
    throw new ToolError(errT('invalidDestination', lang));
};

// 通用：把目的地归一化为 {x, y}
const destToXY = (d, lang) => {
    if (typeof d.x === 'number' && typeof d.y === 'number') return d;
    if (d.isStage || d.isOriginal) return {x: d.x, y: d.y};
    throw new ToolError(errT('coordinatesUnavailable', lang));
};

// 启动气泡显示。
// scratch3_looks.js 中 looks_say / looks_think primitive 的实现是：
//   this.runtime.emit('SAY', util.target, 'say', args.MESSAGE)
// 然后 _updateBubble 监听器调用 _renderBubble 创建/更新气泡。
//
// 我们直接调用 primitive（通过 runtime.getOpcodeFunction），比 emit 更可靠
// （emit 是 EventEmitter 标准 API，理论上应该一样，但实操中直接调 primitive
//  可避免 listener 绑定时机/多个 runtime 实例等边界情况）。
const emitSayThink = (vm, target, type, text) => {
    const message = String(text || '');
    // 1. 写入 custom state（listener 会再写一遍，但提前写无害且方便后续读取）
    const state = getBubbleState(target);
    state.type = type;
    state.text = message;
    setBubbleState(target, state);
    // 2. 直接调用 scratch3_looks 的 primitive
    const opcode = type === 'think' ? 'looks_think' : 'looks_say';
    if (vm.runtime && typeof vm.runtime.getOpcodeFunction === 'function') {
        const fn = vm.runtime.getOpcodeFunction(opcode);
        if (fn) {
            const util = {target, runtime: vm.runtime};
            fn({MESSAGE: message}, util);
            return;
        }
    }
    // 3. 兜底：如果 primitive 拿不到，仍尝试 emit
    if (vm.runtime && typeof vm.runtime.emit === 'function') {
        vm.runtime.emit(SAY_OR_THINK_EVENT, target, type, message);
    }
};

// 等待 primitive 注册完成。
// loadExtensionURL 解析时，primitive 还没通过 dispatch.call 异步注册到
// runtime._primitives，需要轮询 getOpcodeFunction 直到可见。
const waitForPrimitive = (vm, extensionId, opcode, lang, timeoutMs = 2000) =>
    new Promise((resolve, reject) => {
        const start = Date.now();
        const check = () => {
            const fn = vm.runtime.getOpcodeFunction(opcode);
            if (fn) return resolve(fn);
            if (Date.now() - start > timeoutMs) {
                return reject(new ToolError(
                    errT('extensionPrimitiveTimeout', lang, extensionId, opcode)
                ));
            }
            setTimeout(check, 20);
        };
        check();
    });

// 通用：调用扩展的 block primitive。
// pen / music / text2speech / translate 都是 extension，第一次调用前需要加载。
// **关键**：scratch-vm 内部把扩展 opcode 用 `${extensionId}_${opcode}` 前缀化
// （参考 runtime.js:1082 `extendedOpcode = ${categoryInfo.id}_${blockInfo.opcode}`），
// 所以 primitive 注册到 runtime._primitives 时的 key 是带前缀的（'pen_penDown'），
// 不能用裸 opcode（'penDown'）查找。
const callExtensionPrimitive = async (vm, extensionId, opcode, args, target, lang) => {
    if (!vm.extensionManager) {
        throw new ToolError(errT('extensionManagerUnavailable', lang));
    }
    if (!vm.extensionManager.isExtensionLoaded(extensionId)) {
        await vm.extensionManager.loadExtensionURL(extensionId);
    }
    const extendedOpcode = `${extensionId}_${opcode}`;
    const fn = await waitForPrimitive(vm, extensionId, extendedOpcode, lang);
    return await fn(args, {target, runtime: vm.runtime});
};

// 把 '#rrggbb' 字符串转换为 0xRRGGBB 数字（pen COLOR 参数期望）
const hexColorToInt = hex => {
    if (typeof hex === 'number') return hex;
    if (typeof hex !== 'string') return null;
    const m = hex.trim().match(/^#?([0-9a-f]{6})$/i);
    if (!m) return null;
    return parseInt(m[1], 16);
};

// 颜色参数枚举（对应 pen extension 的 colorParam 菜单）
const PEN_COLOR_PARAMS = new Set(['color', 'saturation', 'brightness', 'transparency']);

// 清除气泡
const clearSayThink = (vm, target) => {
    emitSayThink(vm, target, 'say', '');
};

export const createRuntimeToolHandlers = (vm, {lang = 'ja'} = {}) => {
    // 资产工具复用程序员模式的处理器（blocksEnabled=false 防御性强制）
    const projectHandlers = createToolHandlers(vm, {blocksEnabled: false, lang});

    return {
        // ── 観察 ────────────────────────────────────────────────
        actor_get_state: ({target} = {}) => {
            if (target) {
                const t = findTarget(vm, target, lang);
                return {state: targetRuntimeSummary(t)};
            }
            return {state: allTargetsSummary(vm)};
        },

        actor_list_sprites: () => ({
            sprites: vm.runtime.targets.filter(t => t.isOriginal).map(t => ({
                name: t.getName(),
                id: t.id,
                is_stage: t.isStage
            }))
        }),

        // ── 原子動作（書き込むたびに post-state を返す） ─────────
        actor_move: ({target, dx, dy}) => {
            const t = findTarget(vm, target, lang);
            if (t.isStage) throw new ToolError(errT('stageCannotMove', lang));
            t.setXY(t.x + dx, t.y + dy);
            return withStateEcho(t, `move(${dx},${dy})`);
        },

        actor_turn: ({target, degrees}) => {
            const t = findTarget(vm, target, lang);
            if (t.isStage) throw new ToolError(errT('stageCannotTurn', lang));
            t.setDirection(t.direction + degrees);
            return withStateEcho(t, `turn(${degrees})`);
        },

        actor_set_position: ({target, x, y}) => {
            const t = findTarget(vm, target, lang);
            if (t.isStage) throw new ToolError(errT('stageCannotSetPosition', lang));
            t.setXY(x, y);
            return withStateEcho(t, `set_position(${x},${y})`);
        },

        actor_set_direction: ({target, direction}) => {
            const t = findTarget(vm, target, lang);
            if (t.isStage) throw new ToolError(errT('stageCannotSetDirection', lang));
            t.setDirection(direction);
            return withStateEcho(t, `set_direction(${direction})`);
        },

        actor_set_size: ({target, size}) => {
            const t = findTarget(vm, target, lang);
            if (t.isStage) throw new ToolError(errT('stageCannotSetSize', lang));
            t.setSize(size);
            return withStateEcho(t, `set_size(${size})`);
        },

        actor_set_costume: ({target, costume}) => {
            const t = findTarget(vm, target, lang);
            if (t.isStage) throw new ToolError(errT('stageCannotSetCostume', lang));
            let success = false;
            if (typeof costume === 'number') {
                success = t.setCostume(costume);
            } else {
                const costumes = t.getCostumes();
                const idx = costumes.findIndex(c => c.name === costume);
                if (idx < 0) {
                    throw new ToolError(
                        errT('runtimeCostumeNotFound', lang, costume, costumes.map(c => c.name))
                    );
                }
                success = t.setCostume(idx);
            }
            if (!success) throw new ToolError(errT('costumeSetFailed', lang, costume));
            return withStateEcho(t, `set_costume(${costume})`);
        },

        actor_set_visible: ({target, visible}) => {
            const t = findTarget(vm, target, lang);
            if (t.isStage) throw new ToolError(errT('stageCannotSetVisible', lang));
            t.setVisible(visible);
            return withStateEcho(t, `set_visible(${visible})`);
        },

        actor_set_layer: ({target, layer}) => {
            const t = findTarget(vm, target, lang);
            if (layer === 'front') t.goToFront();
            else if (layer === 'back') t.goToBack();
            else throw new ToolError(errT('invalidLayer', lang));
            return withStateEcho(t, `set_layer(${layer})`);
        },

        actor_say: ({target, text}) => {
            const t = findTarget(vm, target, lang);
            if (t.isStage) throw new ToolError(errT('stageCannotSpeak', lang));
            emitSayThink(vm, t, 'say', text);
            return withStateEcho(t, `say("${text}")`);
        },

        actor_think: ({target, text}) => {
            const t = findTarget(vm, target, lang);
            if (t.isStage) throw new ToolError(errT('stageCannotThink', lang));
            emitSayThink(vm, t, 'think', text);
            return withStateEcho(t, `think("${text}")`);
        },

        actor_stop_speaking: ({target}) => {
            const t = findTarget(vm, target, lang);
            if (t.isStage) throw new ToolError(errT('stageHasNoBubble', lang));
            clearSayThink(vm, t);
            return withStateEcho(t, 'stop_speaking');
        },

        // glide 是 timer-based animation（scratch3_motion.js 的 primitive 用 util.yield() 调度）。
        // 我们没有等价机制，改用 setInterval 按帧推进位置，模拟 scratch3_motion.glide 的算法。
        actor_glide: ({target, x, y, secs}) => {
            const t = findTarget(vm, target, lang);
            if (t.isStage) throw new ToolError(errT('stageCannotGlide', lang));
            const startX = t.x;
            const startY = t.y;
            const duration = Math.max(0, secs) * 1000;
            const startTime = Date.now();
            if (duration === 0) {
                t.setXY(x, y);
                return withStateEcho(t, `glide(${x},${y},0s)`);
            }
            return new Promise(resolve => {
                const step = () => {
                    const elapsed = Date.now() - startTime;
                    if (elapsed >= duration) {
                        t.setXY(x, y);
                        resolve(withStateEcho(t, `glide(${x},${y},${secs}s)`));
                        return;
                    }
                    const frac = elapsed / duration;
                    t.setXY(startX + frac * (x - startX), startY + frac * (y - startY));
                    setTimeout(step, 16); // ~60fps
                };
                step();
            });
        },

        // scratch3_motion.pointTowards 的核心算法：
        // direction = 90 - radToDeg(atan2(targetY - y, targetX - x))
        actor_point_towards: ({target, towards}) => {
            const t = findTarget(vm, target, lang);
            if (t.isStage) throw new ToolError(errT('stageCannotPoint', lang));
            const dest = resolveDestination(vm, towards, lang);
            const targetXY = destToXY(dest, lang);
            const dx = targetXY.x - t.x;
            const dy = targetXY.y - t.y;
            const direction = 90 - radToDeg(Math.atan2(dy, dx));
            t.setDirection(direction);
            return withStateEcho(t, `point_towards(${JSON.stringify(towards)})`);
        },

        actor_go_to: ({target, destination}) => {
            const t = findTarget(vm, target, lang);
            if (t.isStage) throw new ToolError(errT('stageCannotMove', lang));
            const dest = resolveDestination(vm, destination, lang);
            const targetXY = destToXY(dest, lang);
            t.setXY(targetXY.x, targetXY.y);
            return withStateEcho(t, `go_to(${JSON.stringify(destination)})`);
        },

        // ── 資産 / クローン管理（projectHandlers を再利用、変更後に全 target リストを返す） ──
        actor_add_sprite: async input => {
            const r = await projectHandlers.add_sprite(input);
            return {...r, state: allTargetsSummary(vm)};
        },

        actor_delete_sprite: input => {
            const r = projectHandlers.delete_sprite(input);
            return {...r, state: allTargetsSummary(vm)};
        },

        actor_rename_sprite: input => {
            const r = projectHandlers.rename_sprite(input);
            return {...r, state: allTargetsSummary(vm)};
        },

        actor_clone_sprite: async ({target}) => {
            const t = findTarget(vm, target, lang);
            if (t.isStage) throw new ToolError(errT('stageCannotClone', lang));
            const cloned = await vm.duplicateSprite(t.id);
            return {
                ok: true,
                target: cloned.getName(),
                cloned_id: cloned.id,
                state: allTargetsSummary(vm)
            };
        },

        actor_add_costume: async input => {
            const r = await projectHandlers.add_costume(input);
            return {...r, state: allTargetsSummary(vm)};
        },

        actor_add_sound: async input => {
            const r = await projectHandlers.add_sound(input);
            return {...r, state: allTargetsSummary(vm)};
        },

        actor_add_backdrop: async input => {
            const r = await projectHandlers.add_backdrop(input);
            return {...r, state: allTargetsSummary(vm)};
        },

        // ── 実行制御 ─────────────────────────────────────────────
        actor_start_project: () => {
            vm.greenFlag();
            return {ok: true, running: true};
        },

        actor_stop_project: () => {
            vm.stopAll();
            return {ok: true, running: false};
        },

        // ── 画筆（pen 拡張） ────────────────────────────────────
        actor_pen_down: async ({target}) => {
            const t = findTarget(vm, target, lang);
            if (t.isStage) throw new ToolError(errT('stageCannotUsePen', lang));
            await callExtensionPrimitive(vm, 'pen', 'penDown', {}, t, lang);
            return withStateEcho(t, 'pen_down');
        },
        actor_pen_up: async ({target}) => {
            const t = findTarget(vm, target, lang);
            if (t.isStage) throw new ToolError(errT('stageCannotUsePen', lang));
            await callExtensionPrimitive(vm, 'pen', 'penUp', {}, t, lang);
            return withStateEcho(t, 'pen_up');
        },
        actor_pen_clear: async () => {
            // clear はどの target にも属さない（ステージ全体）が、primitive は util を要求するので
            // ステージを渡して呼び出す。runtime の _getPenLayerID が -1 を返す時は何もしない。
            const stage = vm.runtime.getTargetForStage();
            await callExtensionPrimitive(vm, 'pen', 'clear', {}, stage, lang);
            return {ok: true, action: 'pen_clear'};
        },
        actor_pen_stamp: async ({target}) => {
            const t = findTarget(vm, target, lang);
            if (t.isStage) throw new ToolError(errT('stageCannotStamp', lang));
            await callExtensionPrimitive(vm, 'pen', 'stamp', {}, t, lang);
            return withStateEcho(t, 'pen_stamp');
        },
        actor_pen_set_color: async ({target, color}) => {
            const t = findTarget(vm, target, lang);
            if (t.isStage) throw new ToolError(errT('stageCannotUsePen', lang));
            // 数字（0xRRGGBB）でも '#rrggbb' 文字列でも受け付ける
            let colorInt;
            if (typeof color === 'number') colorInt = color;
            else if (typeof color === 'string') {
                colorInt = hexColorToInt(color);
                if (colorInt === null) throw new ToolError(errT('invalidColorFormat', lang, color));
            } else {
                throw new ToolError(errT('invalidColorInput', lang));
            }
            await callExtensionPrimitive(vm, 'pen', 'setPenColorToColor', {COLOR: colorInt}, t, lang);
            return withStateEcho(t, `pen_set_color(#${colorInt.toString(16).padStart(6, '0')})`);
        },
        actor_pen_change_color_param: async ({target, param, value}) => {
            const t = findTarget(vm, target, lang);
            if (t.isStage) throw new ToolError(errT('stageCannotUsePen', lang));
            if (!PEN_COLOR_PARAMS.has(param)) {
                throw new ToolError(errT('invalidColorParam', lang, [...PEN_COLOR_PARAMS]));
            }
            await callExtensionPrimitive(vm, 'pen', 'changePenColorParamBy', {COLOR_PARAM: param, VALUE: value}, t, lang);
            return withStateEcho(t, `pen_change_${param}(${value})`);
        },
        actor_pen_set_color_param: async ({target, param, value}) => {
            const t = findTarget(vm, target, lang);
            if (t.isStage) throw new ToolError(errT('stageCannotUsePen', lang));
            if (!PEN_COLOR_PARAMS.has(param)) {
                throw new ToolError(errT('invalidColorParam', lang, [...PEN_COLOR_PARAMS]));
            }
            await callExtensionPrimitive(vm, 'pen', 'setPenColorParamTo', {COLOR_PARAM: param, VALUE: value}, t, lang);
            return withStateEcho(t, `pen_set_${param}(${value})`);
        },
        actor_pen_set_size: async ({target, size}) => {
            const t = findTarget(vm, target, lang);
            if (t.isStage) throw new ToolError(errT('stageCannotUsePen', lang));
            await callExtensionPrimitive(vm, 'pen', 'setPenSizeTo', {SIZE: size}, t, lang);
            return withStateEcho(t, `pen_set_size(${size})`);
        },
        actor_pen_change_size: async ({target, size}) => {
            const t = findTarget(vm, target, lang);
            if (t.isStage) throw new ToolError(errT('stageCannotUsePen', lang));
            await callExtensionPrimitive(vm, 'pen', 'changePenSizeBy', {SIZE: size}, t, lang);
            return withStateEcho(t, `pen_change_size(${size})`);
        },
        actor_pen_set_shade: async ({target, shade}) => {
            const t = findTarget(vm, target, lang);
            if (t.isStage) throw new ToolError(errT('stageCannotUsePen', lang));
            await callExtensionPrimitive(vm, 'pen', 'setPenShadeToNumber', {SHADE: shade}, t, lang);
            return withStateEcho(t, `pen_set_shade(${shade})`);
        },
        actor_pen_change_shade: async ({target, shade}) => {
            const t = findTarget(vm, target, lang);
            if (t.isStage) throw new ToolError(errT('stageCannotUsePen', lang));
            await callExtensionPrimitive(vm, 'pen', 'changePenShadeBy', {SHADE: shade}, t, lang);
            return withStateEcho(t, `pen_change_shade(${shade})`);
        },

        // ── 音楽（music 拡張） ──────────────────────────────────
        actor_play_note: async ({note, beats}) => {
            const stage = vm.runtime.getTargetForStage();
            await callExtensionPrimitive(vm, 'music', 'playNoteForBeats', {NOTE: note, BEATS: beats}, stage, lang);
            return {ok: true, action: `play_note(${note}, ${beats})`};
        },
        actor_play_drum: async ({drum, beats}) => {
            const stage = vm.runtime.getTargetForStage();
            await callExtensionPrimitive(vm, 'music', 'playDrumForBeats', {DRUM: drum, BEATS: beats}, stage, lang);
            return {ok: true, action: `play_drum(${drum}, ${beats})`};
        },
        actor_rest_for_beats: async ({beats}) => {
            const stage = vm.runtime.getTargetForStage();
            await callExtensionPrimitive(vm, 'music', 'restForBeats', {BEATS: beats}, stage, lang);
            return {ok: true, action: `rest(${beats})`};
        },
        actor_set_instrument: async ({instrument}) => {
            const stage = vm.runtime.getTargetForStage();
            await callExtensionPrimitive(vm, 'music', 'setInstrument', {INSTRUMENT: instrument}, stage, lang);
            return {ok: true, action: `set_instrument(${instrument})`};
        },
        actor_set_tempo: async ({tempo}) => {
            const stage = vm.runtime.getTargetForStage();
            await callExtensionPrimitive(vm, 'music', 'setTempo', {TEMPO: tempo}, stage, lang);
            return {ok: true, action: `set_tempo(${tempo})`};
        },
        actor_change_tempo: async ({tempo}) => {
            const stage = vm.runtime.getTargetForStage();
            await callExtensionPrimitive(vm, 'music', 'changeTempo', {TEMPO: tempo}, stage, lang);
            return {ok: true, action: `change_tempo(${tempo})`};
        },

        // ── テキスト読み上げ（text2speech 拡張） ─────────────────
        actor_speak: async ({target, words}) => {
            const t = findTarget(vm, target, lang);
            if (t.isStage) throw new ToolError(errT('stageCannotSpeak', lang));
            await callExtensionPrimitive(vm, 'text2speech', 'speakAndWait', {WORDS: words}, t, lang);
            return withStateEcho(t, `speak("${words}")`);
        },
        actor_set_voice: async ({target, voice}) => {
            const t = findTarget(vm, target, lang);
            if (t.isStage) throw new ToolError(errT('stageCannotSetVoice', lang));
            await callExtensionPrimitive(vm, 'text2speech', 'setVoice', {VOICE: voice}, t, lang);
            return withStateEcho(t, `set_voice(${voice})`);
        },
        actor_set_speech_language: async ({target, language}) => {
            const t = findTarget(vm, target, lang);
            if (t.isStage) throw new ToolError(errT('stageCannotSetSpeechLanguage', lang));
            await callExtensionPrimitive(vm, 'text2speech', 'setLanguage', {LANGUAGE: language}, t, lang);
            return withStateEcho(t, `set_speech_language(${language})`);
        },

        // ── 翻訳（translate 拡張） ──────────────────────────────
        actor_translate: async ({words, language}) => {
            const stage = vm.runtime.getTargetForStage();
            const result = await callExtensionPrimitive(
                vm, 'translate', 'getTranslate', {WORDS: words, LANGUAGE: language}, stage, lang
            );
            return {ok: true, action: `translate(${language})`, original: words, translated: result};
        },
        actor_get_viewer_language: async () => {
            const stage = vm.runtime.getTargetForStage();
            const viewerLang = await callExtensionPrimitive(
                vm, 'translate', 'getViewerLanguage', {}, stage, lang
            );
            return {ok: true, language: viewerLang};
        },

        // ── 拡張機能の明示的有効化 ────────────────────────────────
        // pen / music / text2speech / translate を使う前に agent が呼び出すことで、
        // 拡張の読み込みと primitive 登録を待つ。エラー検出の早期化にも使う。
        actor_ensure_extension: async ({extension_id}) => {
            const KNOWN = ['pen', 'music', 'text2speech', 'translate'];
            if (!KNOWN.includes(extension_id)) {
                throw new ToolError(errT('invalidExtensionId', lang, extension_id, KNOWN));
            }
            if (!vm.extensionManager) {
                throw new ToolError(errT('extensionManagerUnavailable', lang));
            }
            if (vm.extensionManager.isExtensionLoaded(extension_id)) {
                return {ok: true, extension_id, already_loaded: true};
            }
            await vm.extensionManager.loadExtensionURL(extension_id);
            // primitive 登録完了を待つ（最大 3 秒、典型的には数十 ms）
            await new Promise(resolve => setTimeout(resolve, 50));
            return {
                ok: true,
                extension_id,
                loaded: true,
                hint: errT('extensionReadyHint', lang, extension_id)
            };
        }
    };
};