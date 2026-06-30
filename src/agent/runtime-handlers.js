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
//     scratch3_motion.js / scratch3_looks.js 中的 block primitive，需要 (args, util) 调用。
//   - 本文件避开这些 primitive，纯用 RenderedTarget 公开 API + 自己计算数学 + 通过
//     custom state + 'SAY' event 操作气泡。

import {createToolHandlers, ToolError} from './tool-handlers';

// 通过 name 或 id 查找目标（角色/舞台）。
// 与 tool-handlers.js:50 同款（不导出故在此复制）。
const findTarget = (vm, nameOrId) => {
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
        throw new ToolError(`ターゲット "${nameOrId}" が見つかりません。存在するターゲット: ${names.join(', ')}`);
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
const resolveDestination = (vm, input) => {
    if (input === 'mouse-pointer' || input === '_mouse_') {
        const mouse = vm.runtime.ioDevices && vm.runtime.ioDevices.mouse;
        if (!mouse) throw new ToolError('マウス位置を取得できません');
        const x = typeof mouse.getScratchX === 'function' ? mouse.getScratchX() : null;
        const y = typeof mouse.getScratchY === 'function' ? mouse.getScratchY() : null;
        if (x === null || y === null) throw new ToolError('マウス位置を取得できません');
        return {x, y};
    }
    if (typeof input === 'string') return findTarget(vm, input);
    if (typeof input === 'object' && input !== null) {
        if (input.x !== undefined && input.y !== undefined) {
            return {x: input.x, y: input.y};
        }
        if (input.sprite) return findTarget(vm, input.sprite);
    }
    throw new ToolError('destination の形式が無効です');
};

// 通用：把目的地归一化为 {x, y}
const destToXY = d => {
    if (typeof d.x === 'number' && typeof d.y === 'number') return d;
    if (d.isStage || d.isOriginal) return {x: d.x, y: d.y};
    throw new ToolError('座標を取得できません');
};

// 启动气泡显示（通过 runtime event；渲染由 scratch3_looks.js 内部处理）
const emitSayThink = (vm, target, type, text) => {
    const state = getBubbleState(target);
    state.type = type;
    state.text = String(text || '');
    setBubbleState(target, state);
    if (vm.runtime && typeof vm.runtime.emit === 'function') {
        vm.runtime.emit(SAY_OR_THINK_EVENT, target, type, state.text);
    }
};

// 清除气泡
const clearSayThink = (vm, target) => {
    emitSayThink(vm, target, 'say', '');
};

export const createRuntimeToolHandlers = vm => {
    // 资产工具复用程序员模式的处理器（blocksEnabled=false 防御性强制）
    const projectHandlers = createToolHandlers(vm, {blocksEnabled: false});

    return {
        // ── 観察 ────────────────────────────────────────────────
        actor_get_state: ({target} = {}) => {
            if (target) {
                const t = findTarget(vm, target);
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
            const t = findTarget(vm, target);
            if (t.isStage) throw new ToolError('ステージは移動できません');
            t.setXY(t.x + dx, t.y + dy);
            return withStateEcho(t, `move(${dx},${dy})`);
        },

        actor_turn: ({target, degrees}) => {
            const t = findTarget(vm, target);
            if (t.isStage) throw new ToolError('ステージは回転できません');
            t.setDirection(t.direction + degrees);
            return withStateEcho(t, `turn(${degrees})`);
        },

        actor_set_position: ({target, x, y}) => {
            const t = findTarget(vm, target);
            if (t.isStage) throw new ToolError('ステージは位置を設定できません');
            t.setXY(x, y);
            return withStateEcho(t, `set_position(${x},${y})`);
        },

        actor_set_direction: ({target, direction}) => {
            const t = findTarget(vm, target);
            if (t.isStage) throw new ToolError('ステージは向きを設定できません');
            t.setDirection(direction);
            return withStateEcho(t, `set_direction(${direction})`);
        },

        actor_set_size: ({target, size}) => {
            const t = findTarget(vm, target);
            if (t.isStage) throw new ToolError('ステージはサイズを設定できません');
            t.setSize(size);
            return withStateEcho(t, `set_size(${size})`);
        },

        actor_set_costume: ({target, costume}) => {
            const t = findTarget(vm, target);
            if (t.isStage) throw new ToolError('ステージのコスチューム切替は actor_add_backdrop を使ってください');
            let success = false;
            if (typeof costume === 'number') {
                success = t.setCostume(costume);
            } else {
                const costumes = t.getCostumes();
                const idx = costumes.findIndex(c => c.name === costume);
                if (idx < 0) {
                    throw new ToolError(
                        `コスチューム "${costume}" が見つかりません。候補: ${costumes.map(c => c.name).join(', ')}`
                    );
                }
                success = t.setCostume(idx);
            }
            if (!success) throw new ToolError(`コスチューム "${costume}" の設定に失敗しました`);
            return withStateEcho(t, `set_costume(${costume})`);
        },

        actor_set_visible: ({target, visible}) => {
            const t = findTarget(vm, target);
            if (t.isStage) throw new ToolError('ステージの表示切替はできません');
            t.setVisible(visible);
            return withStateEcho(t, `set_visible(${visible})`);
        },

        actor_set_layer: ({target, layer}) => {
            const t = findTarget(vm, target);
            if (layer === 'front') t.goToFront();
            else if (layer === 'back') t.goToBack();
            else throw new ToolError('layer は "front" または "back" です');
            return withStateEcho(t, `set_layer(${layer})`);
        },

        actor_say: ({target, text}) => {
            const t = findTarget(vm, target);
            if (t.isStage) throw new ToolError('ステージは speak できません');
            emitSayThink(vm, t, 'say', text);
            return withStateEcho(t, `say("${text}")`);
        },

        actor_think: ({target, text}) => {
            const t = findTarget(vm, target);
            if (t.isStage) throw new ToolError('ステージは think できません');
            emitSayThink(vm, t, 'think', text);
            return withStateEcho(t, `think("${text}")`);
        },

        actor_stop_speaking: ({target}) => {
            const t = findTarget(vm, target);
            if (t.isStage) throw new ToolError('ステージは吹き出しを持ちません');
            clearSayThink(vm, t);
            return withStateEcho(t, 'stop_speaking');
        },

        // glide 是 timer-based animation（scratch3_motion.js 的 primitive 用 util.yield() 调度）。
        // 我们没有等价机制，改用 setInterval 按帧推进位置，模拟 scratch3_motion.glide 的算法。
        actor_glide: ({target, x, y, secs}) => {
            const t = findTarget(vm, target);
            if (t.isStage) throw new ToolError('ステージは滑行できません');
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
            const t = findTarget(vm, target);
            if (t.isStage) throw new ToolError('ステージは向きを変えられません');
            const dest = resolveDestination(vm, towards);
            const targetXY = destToXY(dest);
            const dx = targetXY.x - t.x;
            const dy = targetXY.y - t.y;
            const direction = 90 - radToDeg(Math.atan2(dy, dx));
            t.setDirection(direction);
            return withStateEcho(t, `point_towards(${JSON.stringify(towards)})`);
        },

        actor_go_to: ({target, destination}) => {
            const t = findTarget(vm, target);
            if (t.isStage) throw new ToolError('ステージは移動できません');
            const dest = resolveDestination(vm, destination);
            const targetXY = destToXY(dest);
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
            const t = findTarget(vm, target);
            if (t.isStage) throw new ToolError('ステージは複製できません');
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
        }
    };
};