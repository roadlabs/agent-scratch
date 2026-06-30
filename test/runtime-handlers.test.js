// runtime-handlers 的单元测试
// - 通过 fake VM 验证：原子动作调用正确的 RenderedTarget 方法、返回的 state 含 post-snapshot
// - 错误路径：找不到 sprite、对 stage 执行 sprite-only 工具应抛出 ToolError
// - 注意：scratch-vm RenderedTarget 公开 API 只有 setXY / setDirection / setVisible / setSize
//   / setCostume / goToFront / goToBack / getCustomState / setCustomState。
//   move / turn / glide / pointTowards / go_to 都通过 setXY + setDirection 自己计算
//   （scratch3_motion.js 的 primitive 不在 RenderedTarget 上）。
//   say/think 通过 custom state + 'SAY' runtime event。
/* eslint-disable no-console */
import assert from 'assert';
import {ToolError} from '../src/agent/tool-handlers';
import {createRuntimeToolHandlers} from '../src/agent/runtime-handlers';

// 构造一个最小的 RenderedTarget 替身（记录方法调用 + 模拟 scratch-vm 公开 API）
const makeFakeTarget = (props = {}) => {
    const defaults = {
        name: 'Sprite1',
        id: 'fake-id-1',
        isStage: false,
        isOriginal: true,
        x: 10,
        y: 20,
        direction: 90,
        size: 100,
        visible: true,
        currentCostume: 0,
        costumes: [{name: 'costume1'}, {name: 'costume2'}],
        sounds: [],
        // custom state 模拟 scratch3_looks.js 的 BUBBLE_STATE_KEY
        _customState: null,
        _emitCalls: []
    };
    const t = {...defaults, ...props};
    const calls = [];
    const rec = (method, args) => calls.push({method, args});
    t._calls = calls;
    t.getName = () => t.name;
    t.getCostumes = () => t.costumes;
    t.getSounds = () => t.sounds;
    t.setXY = (nx, ny) => { rec('setXY', [nx, ny]); t.x = nx; t.y = ny; };
    t.setSize = s => { rec('setSize', [s]); t.size = s; };
    t.setDirection = d => { rec('setDirection', [d]); t.direction = d; };
    t.setVisible = v => { rec('setVisible', [v]); t.visible = v; };
    t.setCostume = idx => {
        rec('setCostume', [idx]);
        if (typeof idx === 'number' && idx >= 0 && idx < t.costumes.length) {
            t.currentCostume = idx;
            return true;
        }
        return false;
    };
    t.goToFront = () => { rec('goToFront', []); };
    t.goToBack = () => { rec('goToBack', []); };
    // scratch3_looks.js 的 custom state 接口
    t.getCustomState = key => t._customState && t._customState[key];
    t.setCustomState = (key, value) => {
        t._customState = {...(t._customState || {}), [key]: value};
    };
    return t;
};

// 构造一个 fake VM（包含 targets 数组 + 几个常用方法）
const makeFakeVm = ({targets = [], stage = null} = {}) => {
    return {
        runtime: {
            targets,
            getTargetForStage: () => stage,
            getTargetById: id => targets.find(t => t.id === id) || null
        }
    };
};

// --- 测试 1: actor_move 调用 setXY（自己计算 dx/dy 后的位置） ---
{
    const sprite = makeFakeTarget({x: 10, y: 20});
    const vm = makeFakeVm({targets: [sprite]});
    const handlers = createRuntimeToolHandlers(vm);
    const result = handlers.actor_move({target: 'Sprite1', dx: 30, dy: 40});

    assert.strictEqual(sprite._calls.length, 1, 'actor_move 应只调用 setXY 一次');
    assert.deepStrictEqual(sprite._calls[0], {method: 'setXY', args: [40, 60]});
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.target, 'Sprite1');
    assert.strictEqual(result.state.x, 40, 'state.x 应反映 post-position');
    assert.strictEqual(result.state.y, 60, 'state.y 应反映 post-position');
    console.log('test1 OK: actor_move 调用 setXY 且回显 post-state');
}

// --- 测试 2: actor_set_position 调用 setXY ---
{
    const sprite = makeFakeTarget({x: 0, y: 0});
    const vm = makeFakeVm({targets: [sprite]});
    const handlers = createRuntimeToolHandlers(vm);
    const result = handlers.actor_set_position({target: 'Sprite1', x: 100, y: -50});

    assert.strictEqual(sprite._calls[0].method, 'setXY');
    assert.deepStrictEqual(sprite._calls[0].args, [100, -50]);
    assert.strictEqual(result.state.x, 100);
    assert.strictEqual(result.state.y, -50);
    console.log('test2 OK: actor_set_position 调用 setXY 且回显 post-state');
}

// --- 测试 3: actor_turn 调用 setDirection（自己计算相对值） ---
{
    const sprite = makeFakeTarget({direction: 90});
    const vm = makeFakeVm({targets: [sprite]});
    const handlers = createRuntimeToolHandlers(vm);
    const result = handlers.actor_turn({target: 'Sprite1', degrees: 45});

    assert.strictEqual(sprite._calls[0].method, 'setDirection');
    assert.deepStrictEqual(sprite._calls[0].args, [135]);
    assert.strictEqual(result.state.direction, 135);
    console.log('test3 OK: actor_turn 计算相对值后调用 setDirection 且回显 post-state');
}

// --- 测试 4: actor_say 通过 custom state + 'SAY' event 实现 ---
{
    const sprite = makeFakeTarget();
    const emitted = [];
    const vm = makeFakeVm({targets: [sprite]});
    vm.runtime.emit = (event, target, type, text) => {
        emitted.push({event, target: target.name, type, text});
    };
    const handlers = createRuntimeToolHandlers(vm);
    const result = handlers.actor_say({target: 'Sprite1', text: 'hello'});

    // 1. 应写入 custom state
    const bubbleState = sprite.getCustomState('Scratch.looks');
    assert.ok(bubbleState, 'custom state 应被设置');
    assert.strictEqual(bubbleState.type, 'say');
    assert.strictEqual(bubbleState.text, 'hello');
    // 2. 应 emit 'SAY' event
    assert.strictEqual(emitted.length, 1);
    assert.strictEqual(emitted[0].event, 'SAY');
    assert.strictEqual(emitted[0].type, 'say');
    assert.strictEqual(emitted[0].text, 'hello');
    // 3. state 回显
    assert.strictEqual(result.state.saying, 'hello');
    assert.strictEqual(result.state.bubble, 'say');
    console.log('test4 OK: actor_say 写入 custom state + emit SAY event 且回显 post-state');
}

// --- 测试 5: actor_get_state 返回全量 sprite 列表 ---
{
    const sprite1 = makeFakeTarget({name: 'Sprite1', id: 'id-1'});
    const sprite2 = makeFakeTarget({name: 'Sprite2', id: 'id-2', x: 50});
    const stage = makeFakeTarget({name: 'Stage', isStage: true});
    const vm = makeFakeVm({targets: [sprite1, sprite2, stage]});
    const handlers = createRuntimeToolHandlers(vm);

    const all = handlers.actor_get_state();
    assert.strictEqual(all.state.length, 3, '全量 state 应包含 3 个 target');
    assert.strictEqual(all.state[0].name, 'Sprite1');
    assert.strictEqual(all.state[2].is_stage, true);

    const single = handlers.actor_get_state({target: 'Sprite2'});
    assert.strictEqual(single.state.x, 50);
    console.log('test5 OK: actor_get_state 支持全量与单 target');
}

// --- 测试 6: actor_list_sprites 返回 name/id/is_stage ---
{
    const sprite = makeFakeTarget({name: 'Sprite1', id: 'id-1'});
    const stage = makeFakeTarget({name: 'Stage', id: 'id-stage', isStage: true});
    const vm = makeFakeVm({targets: [sprite, stage]});
    const handlers = createRuntimeToolHandlers(vm);

    const result = handlers.actor_list_sprites();
    assert.strictEqual(result.sprites.length, 2);
    assert.strictEqual(result.sprites[0].name, 'Sprite1');
    assert.strictEqual(result.sprites[1].is_stage, true);
    console.log('test6 OK: actor_list_sprites 返回 name/id/is_stage');
}

// --- 测试 7: actor_set_costume 支持索引和名称 ---
{
    const sprite = makeFakeTarget();
    const vm = makeFakeVm({targets: [sprite]});
    const handlers = createRuntimeToolHandlers(vm);

    handlers.actor_set_costume({target: 'Sprite1', costume: 1});
    assert.strictEqual(sprite.currentCostume, 1);

    handlers.actor_set_costume({target: 'Sprite1', costume: 'costume2'});
    assert.strictEqual(sprite.currentCostume, 1, 'costume2 是索引 1');
    console.log('test7 OK: actor_set_costume 支持索引和名称');
}

// --- 测试 8: actor_set_costume 名称不存在抛 ToolError ---
{
    const sprite = makeFakeTarget();
    const vm = makeFakeVm({targets: [sprite]});
    const handlers = createRuntimeToolHandlers(vm);

    let threw = false;
    try {
        handlers.actor_set_costume({target: 'Sprite1', costume: 'nonexistent'});
    } catch (e) {
        threw = true;
        assert.ok(e instanceof ToolError, '应抛 ToolError');
        assert.ok(e.message.includes('nonexistent'), '错误消息应包含 costume 名');
    }
    assert.ok(threw, '不存在的 costume 名应抛错');
    console.log('test8 OK: actor_set_costume 不存在的名称抛 ToolError');
}

// --- 测试 9: 对 stage 调用 sprite-only 工具抛 ToolError ---
{
    const stage = makeFakeTarget({name: 'Stage', isStage: true});
    const vm = makeFakeVm({targets: [stage]});
    const handlers = createRuntimeToolHandlers(vm);

    let threw;
    try {
        handlers.actor_move({target: 'Stage', dx: 10, dy: 0});
    } catch (e) { threw = e; }
    assert.ok(threw instanceof ToolError, '对 stage 调用 actor_move 应抛 ToolError');

    threw = null;
    try {
        handlers.actor_say({target: 'Stage', text: 'hi'});
    } catch (e) { threw = e; }
    assert.ok(threw instanceof ToolError, '对 stage 调用 actor_say 应抛 ToolError');
    console.log('test9 OK: 对 stage 调用 sprite-only 工具抛 ToolError');
}

// --- 测试 10: 找不到 sprite 抛 ToolError（含候选列表） ---
{
    const sprite = makeFakeTarget({name: 'Sprite1'});
    const vm = makeFakeVm({targets: [sprite]});
    const handlers = createRuntimeToolHandlers(vm);

    let threw;
    try {
        handlers.actor_move({target: 'Ghost', dx: 0, dy: 0});
    } catch (e) { threw = e; }
    assert.ok(threw instanceof ToolError, '应抛 ToolError');
    assert.ok(threw.message.includes('Ghost'), '错误应包含查询的名字');
    assert.ok(threw.message.includes('Sprite1'), '错误应包含候选列表');
    console.log('test10 OK: 找不到 sprite 抛 ToolError（含候选列表）');
}

// --- 测试 11: actor_start_project / actor_stop_project 调用 VM ---
{
    let greenFlagged = 0;
    let stopped = 0;
    const vm = {
        runtime: {targets: [], getTargetForStage: () => null, getTargetById: () => null},
        greenFlag: () => { greenFlagged++; },
        stopAll: () => { stopped++; }
    };
    const handlers = createRuntimeToolHandlers(vm);

    handlers.actor_start_project();
    handlers.actor_stop_project();
    assert.strictEqual(greenFlagged, 1);
    assert.strictEqual(stopped, 1);
    console.log('test11 OK: actor_start_project / actor_stop_project 调用 VM');
}

// --- 测试 12: actor_clone_sprite 不可对 stage （async） ---
const runAsyncTests = async () => {
    const stage = makeFakeTarget({name: 'Stage', isStage: true});
    const vm = {
        runtime: {targets: [stage], getTargetForStage: () => stage, getTargetById: () => null}
    };
    const handlers = createRuntimeToolHandlers(vm);

    let threw;
    try {
        await handlers.actor_clone_sprite({target: 'Stage'});
    } catch (e) { threw = e; }
    assert.ok(threw instanceof ToolError, '对 stage 克隆应抛 ToolError');
    console.log('test12 OK: actor_clone_sprite 拒绝 stage');

    console.log('ALL TESTS PASSED');
};

runAsyncTests();