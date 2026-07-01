// block-builder の単体テスト: DSL → runtime blocks を実際の scratch-vm Blocks
// コンテナに投入し、toXML(全構造を再帰走査)が壊れないことを確認する
/* eslint-disable no-console */
import assert from 'assert';
import {buildScripts, dslFromBlocks, uid} from '../src/agent/block-builder';

// exports フィールドの制限を回避するため相対パスで参照
const Runtime = require('../node_modules/@scratch/scratch-vm/src/engine/runtime');
const Blocks = require('../node_modules/@scratch/scratch-vm/src/engine/blocks');

const variables = {};
const resolveVariable = (name, type) => {
    const key = `${type}:${name}`;
    if (!variables[key]) variables[key] = {id: uid(), name};
    return variables[key];
};

// --- テスト1: 旗クリック → ずっと動く ---
const dsl1 = [
    {blocks: [
        {opcode: 'event_whenflagclicked'},
        {opcode: 'control_forever', substack: [
            {opcode: 'motion_movesteps', inputs: {STEPS: 10}},
            {opcode: 'motion_ifonedgebounce'}
        ]}
    ]}
];
const blocks1 = buildScripts(dsl1, {resolveVariable});
const container1 = new Blocks(new Runtime());
for (const b of Object.values(blocks1)) container1.createBlock(b);
assert.strictEqual(container1.getScripts().length, 1, 'スクリプトは1本');
const xml1 = container1.toXML();
assert.ok(xml1.includes('motion_movesteps'), 'XMLにopcodeが含まれる');
assert.ok(xml1.includes('math_number'), '数値shadowが生成される');
console.log('test1 OK: 基本スタック+forever');

// --- テスト2: 変数・条件分岐・ネスト演算・メニュー ---
const dsl2 = [
    {x: 100, y: 100, blocks: [
        {opcode: 'event_whenkeypressed', fields: {KEY_OPTION: 'space'}},
        {opcode: 'data_setvariableto', fields: {VARIABLE: 'スコア'}, inputs: {VALUE: 0}},
        {opcode: 'control_if_else',
            inputs: {CONDITION: {opcode: 'operator_gt',
                inputs: {
                    OPERAND1: {opcode: 'data_variable', fields: {VARIABLE: 'スコア'}},
                    OPERAND2: 10
                }}},
            substack: [
                {opcode: 'looks_say', inputs: {MESSAGE: '勝ち!'}}
            ],
            substack2: [
                {opcode: 'motion_goto', inputs: {TO: '_random_'}},
                {opcode: 'data_changevariableby', fields: {VARIABLE: 'スコア'}, inputs: {VALUE: 1}}
            ]},
        {opcode: 'event_broadcast', inputs: {BROADCAST_INPUT: 'ゲーム終了'}},
        {opcode: 'control_stop', fields: {STOP_OPTION: 'all'}}
    ]}
];
const blocks2 = buildScripts(dsl2, {resolveVariable});
const container2 = new Blocks(new Runtime());
for (const b of Object.values(blocks2)) container2.createBlock(b);
assert.strictEqual(container2.getScripts().length, 1);
const xml2 = container2.toXML();
assert.ok(xml2.includes('operator_gt'), '条件ネスト');
assert.ok(xml2.includes('スコア'), '変数名');
assert.ok(xml2.includes('motion_goto_menu'), 'メニューshadow');
assert.ok(xml2.includes('event_broadcast_menu'), 'broadcastメニュー');
assert.ok(xml2.includes('mutation'), 'control_stopのmutation');
// 変数が型別に解決されている
assert.ok(variables[':スコア'], '変数が作成された');
assert.ok(variables['broadcast_msg:ゲーム終了'], 'ブロードキャストが作成された');
console.log('test2 OK: 変数・if_else・ネスト・メニュー・mutation');

// --- テスト3: 逆変換(round-trip) ---
const roundTrip = dslFromBlocks(container2);
assert.strictEqual(roundTrip.length, 1);
const rtBlocks = roundTrip[0].blocks;
assert.strictEqual(rtBlocks[0].opcode, 'event_whenkeypressed');
assert.strictEqual(rtBlocks[0].fields.KEY_OPTION, 'space');
assert.strictEqual(rtBlocks[1].inputs.VALUE, '0');
assert.strictEqual(rtBlocks[2].inputs.CONDITION.opcode, 'operator_gt');
assert.strictEqual(rtBlocks[2].inputs.CONDITION.inputs.OPERAND1.opcode, 'data_variable');
assert.strictEqual(rtBlocks[2].substack[0].opcode, 'looks_say');
assert.strictEqual(rtBlocks[2].substack2.length, 2);
console.log('test3 OK: DSL逆変換');

// --- テスト4: エラー検出（BuildError は symbolic errorKey + args を運ぶ） ---
// BuildError.message は errorKey 文字列そのもの（旧テストの substring 検査は通用しなくなった）。
// 各 site に対し期待 errorKey を明示的に検証する。
const expectErrorKey = (scripts, expectedKey, label) => {
    try {
        buildScripts(scripts, {resolveVariable});
        assert.fail(`${label}: エラーになるべき`);
    } catch (e) {
        assert.strictEqual(e.errorKey, expectedKey, `${label}: errorKey が一致 (got ${e.errorKey})`);
    }
};
expectErrorKey([{blocks: [{opcode: 'motion_movestepsss'}]}], 'unknownOpcode', '未知opcode');
expectErrorKey([{blocks: [{opcode: 'operator_add'}]}], 'valueBlockInStack', 'reporterをスタックに');
expectErrorKey(
    [{blocks: [{opcode: 'control_if', inputs: {CONDITION: {opcode: 'motion_xposition'}}, substack: []}]}],
    'booleanInputNeedsBooleanBlock', 'boolean入力にreporter');
expectErrorKey(
    [{blocks: [{opcode: 'motion_movesteps'}, {opcode: 'event_whenflagclicked'}]}],
    'hatNotAtTop', 'hatが途中');
expectErrorKey([{x: 1}], 'scriptsMissingBlocks', 'blocks 配列なし');
expectErrorKey([{blocks: [{opcode: 'event_whenkeypressed'}]}], 'fieldRequired', 'field null');
expectErrorKey('not-array', 'scriptsNotArray', 'scripts 配列でない');
expectErrorKey(
    [{blocks: [{opcode: 'control_if', inputs: {CONDITION: 'true'}, substack: []}]}],
    'booleanInputNeedsBlock', 'boolean に文字列'
);
expectErrorKey(
    [{blocks: [{opcode: 'event_broadcast', inputs: {BROADCAST_INPUT: {opcode: 'looks_say'}}}]}],
    'broadcastNameRequired', 'broadcast 名でなくブロック'
);
expectErrorKey(
    [{blocks: [{opcode: 'event_broadcast', inputs: {BROADCAST_INPUT: null}}]}],
    'broadcastNameRequired', 'broadcast null'
);
console.log('test4 OK: バリデーションエラー(errorKey 検証)');

// --- テスト5: メニュー/フィールド値の検証 ---
expectErrorKey(
    [{blocks: [{opcode: 'event_whenkeypressed', fields: {KEY_OPTION: 'スペース'}}]}],
    'invalidChoice', '不正なキー名');
expectErrorKey(
    [{blocks: [{opcode: 'control_stop', fields: {STOP_OPTION: 'stop all'}}]}],
    'invalidChoice', '不正なSTOP_OPTION');
// dynamic付きメニューはVM情報(dynamicValues)が無ければ検証スキップ(スプライト名かもしれないため)
buildScripts([{blocks: [{opcode: 'event_whenflagclicked'}, {opcode: 'motion_goto', inputs: {TO: 'random'}}]}], {resolveVariable});
// 正しい値は通る
buildScripts([{blocks: [
    {opcode: 'event_whenkeypressed', fields: {KEY_OPTION: 'space'}},
    {opcode: 'motion_goto', inputs: {TO: '_mouse_'}},
    {opcode: 'control_stop', fields: {STOP_OPTION: 'all'}}
]}], {resolveVariable});
// dynamicValues を渡すと実在チェックされる
const dynCtx = {resolveVariable, dynamicValues: {sprites: ['Ball'], costumes: ['costume1'], sounds: ['Meow'], backdrops: ['backdrop1']}};
buildScripts([{blocks: [
    {opcode: 'event_whenflagclicked'},
    {opcode: 'looks_switchcostumeto', inputs: {COSTUME: 'costume1'}},
    {opcode: 'sound_play', inputs: {SOUND_MENU: 'Meow'}},
    {opcode: 'control_if', inputs: {CONDITION: {opcode: 'sensing_touchingobject', inputs: {TOUCHINGOBJECTMENU: 'Ball'}}}, substack: []}
]}], dynCtx);
try {
    buildScripts([{blocks: [{opcode: 'event_whenflagclicked'}, {opcode: 'looks_switchcostumeto', inputs: {COSTUME: 'costume99'}}]}], dynCtx);
    assert.fail('実在しないコスチュームはエラーになるべき');
} catch (e) {
    assert.strictEqual(e.errorKey, 'invalidChoice', 'invalidChoice: ' + e.message);
    // 許可値（costume1）が errorArgs に含まれている
    assert.ok(e.errorArgs.some(a => Array.isArray(a) && a.includes('costume1')),
        'errorArgs に許可値一覧: ' + JSON.stringify(e.errorArgs));
}
try {
    buildScripts([{blocks: [{opcode: 'event_whenflagclicked'}, {opcode: 'motion_goto', inputs: {TO: 'random'}}]}], dynCtx);
    assert.fail('dynamicValuesありなら不正なgoto先はエラーになるべき');
} catch (e) {
    assert.strictEqual(e.errorKey, 'invalidChoice');
}
console.log('test5 OK: メニュー/フィールド値の検証(静的+動的)');

// --- テスト6: 色形式の検証 ---
expectErrorKey(
    [{blocks: [{opcode: 'event_whenflagclicked'}, {opcode: 'pen_setPenColorToColor', inputs: {COLOR: 'red'}}]}],
    'colorFormat', '色名はエラー');
buildScripts([{blocks: [
    {opcode: 'event_whenflagclicked'},
    {opcode: 'pen_setPenColorToColor', inputs: {COLOR: '#ff0000'}}
]}], {resolveVariable});
console.log('test6 OK: 色形式の検証');

// --- テスト7: BuildError.errorKey + errorArgs 完整性 ---
// BuildError インスタンス化テスト（直接 throw せずに new して検証）
import {BuildError} from '../src/agent/block-builder';
const be = new BuildError('unknownOpcode', 'p.x', 'fake_op');
assert.strictEqual(be.errorKey, 'unknownOpcode');
assert.deepStrictEqual(be.errorArgs, ['p.x', 'fake_op']);
// errorKey を message にも入れる（throw 後のデバッグ用フォールバック）
assert.strictEqual(be.message, 'unknownOpcode');
console.log('test7 OK: BuildError 構造');

console.log('ALL TESTS PASSED');
