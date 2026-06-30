// runtime-tools の単体テスト
// - 工具名称的唯一性与 actor_ 前缀
// - input_schema 的形状（必填字段存在、类型正确）
// - summarizeActorToolCall / runtimeDraftingLabel 的三语言输出
/* eslint-disable no-console */
import assert from 'assert';
import {
    RUNTIME_TOOLS,
    RUNTIME_TOOL_NAMES,
    runtimeDraftingLabel,
    summarizeActorToolCall
} from '../src/agent/runtime-tools';

// --- 工具集合的完整性 ---
const expectedNames = [
    // 观察
    'actor_get_state', 'actor_list_sprites',
    // 原子动作
    'actor_move', 'actor_turn', 'actor_set_position', 'actor_set_direction',
    'actor_set_size', 'actor_set_costume', 'actor_set_visible', 'actor_set_layer',
    'actor_say', 'actor_think', 'actor_stop_speaking', 'actor_glide',
    'actor_point_towards', 'actor_go_to',
    // 资产 / 克隆
    'actor_add_sprite', 'actor_delete_sprite', 'actor_rename_sprite', 'actor_clone_sprite',
    'actor_add_costume', 'actor_add_sound', 'actor_add_backdrop',
    // 执行
    'actor_start_project', 'actor_stop_project',
    // 画笔
    'actor_pen_down', 'actor_pen_up', 'actor_pen_clear', 'actor_pen_stamp',
    'actor_pen_set_color', 'actor_pen_change_color_param', 'actor_pen_set_color_param',
    'actor_pen_set_size', 'actor_pen_change_size',
    'actor_pen_set_shade', 'actor_pen_change_shade',
    // 音乐
    'actor_play_note', 'actor_play_drum', 'actor_rest_for_beats',
    'actor_set_instrument', 'actor_set_tempo', 'actor_change_tempo',
    // 朗读
    'actor_speak', 'actor_set_voice', 'actor_set_speech_language',
    // 翻译
    'actor_translate', 'actor_get_viewer_language'
];

for (const name of expectedNames) {
    assert.ok(RUNTIME_TOOL_NAMES.has(name), `RUNTIME_TOOL_NAMES 应包含 ${name}`);
}
console.log(`test1 OK: RUNTIME_TOOL_NAMES 包含全部 ${expectedNames.length} 个预期工具名（实际工具总数 ${RUNTIME_TOOL_NAMES.size}）`);

// --- 所有工具名以 actor_ 前缀且唯一 ---
const allNames = RUNTIME_TOOLS.map(t => t.name);
for (const name of allNames) {
    assert.ok(name.startsWith('actor_'), `工具名 ${name} 必须以 actor_ 前缀开头`);
}
assert.strictEqual(new Set(allNames).size, allNames.length, '工具名不应重复');
console.log(`test2 OK: 全部 ${allNames.length} 个工具以 actor_ 前缀且唯一`);

// --- 每个工具有 name / description / input_schema ---
for (const tool of RUNTIME_TOOLS) {
    assert.strictEqual(typeof tool.name, 'string', `${tool.name}: name 应为 string`);
    assert.strictEqual(typeof tool.description, 'string', `${tool.name}: description 应为 string 且非空`);
    assert.ok(tool.description.length > 10, `${tool.name}: description 不应过短`);
    assert.strictEqual(typeof tool.input_schema, 'object', `${tool.name}: input_schema 应为 object`);
    assert.strictEqual(tool.input_schema.type, 'object', `${tool.name}: input_schema.type 应为 object`);
    assert.ok(tool.input_schema.properties, `${tool.name}: input_schema 应有 properties`);
}
console.log('test3 OK: 全部工具包含合法的 name/description/input_schema');

// --- 必填字段检查 ---
const requiredChecks = {
    actor_move: ['target', 'dx', 'dy'],
    actor_turn: ['target', 'degrees'],
    actor_set_position: ['target', 'x', 'y'],
    actor_set_direction: ['target', 'direction'],
    actor_set_size: ['target', 'size'],
    actor_set_costume: ['target', 'costume'],
    actor_set_visible: ['target', 'visible'],
    actor_set_layer: ['target', 'layer'],
    actor_say: ['target', 'text'],
    actor_think: ['target', 'text'],
    actor_stop_speaking: ['target'],
    actor_glide: ['target', 'x', 'y', 'secs'],
    actor_point_towards: ['target', 'towards'],
    actor_go_to: ['target', 'destination'],
    actor_add_sprite: ['name'],
    actor_delete_sprite: ['target'],
    actor_rename_sprite: ['target', 'new_name'],
    actor_clone_sprite: ['target'],
    actor_add_costume: ['target', 'costume_name'],
    actor_add_sound: ['target', 'sound_name'],
    actor_add_backdrop: ['backdrop_name']
};
for (const [name, required] of Object.entries(requiredChecks)) {
    const tool = RUNTIME_TOOLS.find(t => t.name === name);
    assert.ok(tool, `${name} 应在 RUNTIME_TOOLS 中`);
    const actual = new Set(tool.input_schema.required || []);
    for (const r of required) {
        assert.ok(actual.has(r), `${name}: required 应包含 ${r}`);
    }
}
console.log('test4 OK: 全部写入类工具的 required 字段齐全');

// --- actor_set_layer 的 enum 约束 ---
const layerTool = RUNTIME_TOOLS.find(t => t.name === 'actor_set_layer');
assert.deepStrictEqual(layerTool.input_schema.properties.layer.enum, ['front', 'back'],
    'actor_set_layer.layer 应限制为 front/back');
console.log('test5 OK: actor_set_layer 接受 front/back');

// --- runtimeDraftingLabel 三语言 ---
assert.ok(runtimeDraftingLabel('actor_move', 'ja').length > 0, 'ja draftingLabel');
assert.ok(runtimeDraftingLabel('actor_move', 'en').length > 0, 'en draftingLabel');
assert.ok(runtimeDraftingLabel('actor_move', 'zh').length > 0, 'zh draftingLabel');
assert.notStrictEqual(runtimeDraftingLabel('actor_move', 'ja'),
    runtimeDraftingLabel('actor_move', 'en'), 'ja 与 en 应不同');
console.log('test6 OK: runtimeDraftingLabel 三语言均输出且不同');

// --- summarizeActorToolCall 三语言包含核心信息 ---
assert.ok(summarizeActorToolCall('actor_move', {target: 'Sprite1', dx: 10, dy: 0}, 'ja').includes('Sprite1'),
    'ja actor_move 摘要应包含 target');
assert.ok(summarizeActorToolCall('actor_move', {target: 'Sprite1', dx: 10, dy: 0}, 'en').includes('Sprite1'),
    'en actor_move 摘要应包含 target');
assert.ok(summarizeActorToolCall('actor_set_position', {target: 'Sprite1', x: 100, y: 50}, 'zh').includes('100'),
    'zh actor_set_position 摘要应包含坐标');
console.log('test7 OK: summarizeActorToolCall 三语言包含关键信息');

console.log('ALL TESTS PASSED');