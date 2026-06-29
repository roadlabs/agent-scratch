// Runtime Actor 模式的工具处理器。
//
// 设计核心：每个写入动作（move / set_position 等）返回 {ok, action, state}，
// 其中 state 是受影响 sprite 的当前快照。这强制 closed feedback loop：
// LLM 每次动作后必定看到最新状态，无法基于陈旧记忆决策。
//
// 与程序员模式的关键差异：
//   - 不使用 set_scripts（actor 模式不创作积木脚本）
//   - 状态回显以"单个 sprite"为单位（不像 get_project_state 那样全量）
//   - 资产/克隆管理复用 createToolHandlers 的逻辑

import {createToolHandlers, ToolError} from './tool-handlers';

// 通过 name 或 id 查找目标（角色/舞台）。
// 与 tool-handlers.js:50 同款（不导出故在此复制）。
// 错误信息本地化保持一致（ja）。
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
        summary.x = Math.round(target.x);
        summary.y = Math.round(target.y);
        summary.direction = Math.round(target.direction);
        summary.size = target.size;
        summary.visible = target.visible;
        summary.saying = target.sayingText || null;
        summary.thinking = target.thinkingText || null;
        summary.bubble = target.bubbleType || null;
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

export const createRuntimeToolHandlers = vm => {
    // 资产工具复用程序员模式的处理器（blocksEnabled=false 防御性强制）
    const projectHandlers = createToolHandlers(vm, {blocksEnabled: false});

    // 解析 go_to / point_towards 的 destination 参数 → RenderedTarget / 坐标 / mouse-pointer
    const resolveDestination = input => {
        if (input === 'mouse-pointer' || input === '_mouse_') return '_mouse_';
        if (typeof input === 'string') return findTarget(vm, input);
        if (typeof input === 'object' && input !== null) {
            if (input.x !== undefined && input.y !== undefined) {
                return {x: input.x, y: input.y};
            }
            if (input.sprite) return findTarget(vm, input.sprite);
        }
        throw new ToolError('destination の形式が無効です');
    };

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
            t.changeX(dx);
            t.changeY(dy);
            return withStateEcho(t, `move(${dx},${dy})`);
        },

        actor_turn: ({target, degrees}) => {
            const t = findTarget(vm, target);
            if (t.isStage) throw new ToolError('ステージは回転できません');
            t.turnRight(degrees);
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
            if (!['front', 'back'].includes(layer)) {
                throw new ToolError('layer は "front" または "back" です');
            }
            if (typeof t.goToLayer === 'function') {
                t.goToLayer(layer);
            } else {
                throw new ToolError('この scratch-vm バージョンではレイヤー変更がサポートされていません');
            }
            return withStateEcho(t, `set_layer(${layer})`);
        },

        actor_say: ({target, text}) => {
            const t = findTarget(vm, target);
            if (t.isStage) throw new ToolError('ステージは speak できません');
            t.say(text);
            return withStateEcho(t, `say("${text}")`);
        },

        actor_think: ({target, text}) => {
            const t = findTarget(vm, target);
            if (t.isStage) throw new ToolError('ステージは think できません');
            t.think(text);
            return withStateEcho(t, `think("${text}")`);
        },

        actor_stop_speaking: ({target}) => {
            const t = findTarget(vm, target);
            if (t.isStage) throw new ToolError('ステージは吹き出しを持ちません');
            t.stopSpeaking();
            return withStateEcho(t, 'stop_speaking');
        },

        actor_glide: async ({target, x, y, secs}) => {
            const t = findTarget(vm, target);
            if (t.isStage) throw new ToolError('ステージは滑行できません');
            await t.glideTo(x, y, secs);
            return withStateEcho(t, `glide(${x},${y},${secs}s)`);
        },

        actor_point_towards: ({target, towards}) => {
            const t = findTarget(vm, target);
            if (t.isStage) throw new ToolError('ステージは向きを変えられません');
            const dest = resolveDestination(towards);
            t.pointTowards(dest);
            return withStateEcho(t, `point_towards(${JSON.stringify(towards)})`);
        },

        actor_go_to: ({target, destination}) => {
            const t = findTarget(vm, target);
            if (t.isStage) throw new ToolError('ステージは移動できません');
            const dest = resolveDestination(destination);
            // t.goTo(x, y) / t.goTo(target) / t.goTo('_mouse_') すべて RenderedTarget.goTo で対応
            t.goTo(dest);
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