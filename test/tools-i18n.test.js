// tools.js の i18n 検証: getTools(lang) と localizeSchema() の挙動
/* eslint-disable no-console */
import assert from 'assert';
import {getTools, BLOCK_TOOL_NAMES} from '../src/agent/tools.js';

// --- 全 lang で全ツールが name + description を持つ ---
for (const lang of ['ja', 'en', 'zh']) {
    const tools = getTools(lang);
    for (const tool of tools) {
        assert.strictEqual(typeof tool.name, 'string', `${lang}/${tool.name}: name is string`);
        assert.ok(tool.description && tool.description.length >= 4,
            `${lang}/${tool.name}: description has substance (got "${tool.description}")`);
        assert.strictEqual(tool.input_schema.type, 'object', `${lang}/${tool.name}: input_schema.type is object`);
        // description_i18n は出力に漏れていない
        assert.strictEqual(tool.description_i18n, undefined, `${lang}/${tool.name}: description_i18n not leaked`);
    }
}
console.log('test1 OK: 全ツールが 3 lang で name/description を持ち、description_i18n は漏れていない');

// --- 各 lang の description が互いに異なる（コピー漏れ検出） ---
const jaTools = getTools('ja');
const enTools = getTools('en');
const zhTools = getTools('zh');
for (let i = 0; i < jaTools.length; i++) {
    assert.notStrictEqual(jaTools[i].description, enTools[i].description, `${jaTools[i].name}: ja != en`);
    assert.notStrictEqual(jaTools[i].description, zhTools[i].description, `${jaTools[i].name}: ja != zh`);
}
console.log('test2 OK: ja/en/zh の description は互いに異なる');

// --- キャッシュ: 同一 lang で同一参照を返す ---
assert.strictEqual(getTools('ja'), jaTools, 'ja cache hit (same reference)');
assert.strictEqual(getTools('en'), enTools, 'en cache hit');
assert.strictEqual(getTools('zh'), zhTools, 'zh cache hit');
console.log('test3 OK: 同一 lang で cache ヒット');

// --- 未知 lang は ja にフォールバック（description が ja と同じになる） ---
const fallback = getTools('fr');
assert.strictEqual(fallback.length, jaTools.length, '未知 lang でも同じ要素数');
for (let i = 0; i < fallback.length; i++) {
    assert.strictEqual(fallback[i].description, jaTools[i].description,
        `未知 lang "${fallback[i].name}" の description は ja と同じ`);
}
console.log('test4 OK: 未知 lang フォールバック（description は ja 相当）');

// --- input_schema の description も localization される ---
const setScriptsJa = jaTools.find(t => t.name === 'set_scripts');
const setScriptsEn = enTools.find(t => t.name === 'set_scripts');
assert.ok(setScriptsJa.input_schema.properties.scripts.description, 'scripts sub-schema の desc ja');
assert.ok(setScriptsEn.input_schema.properties.scripts.description, 'scripts sub-schema の desc en');
assert.notStrictEqual(
    setScriptsJa.input_schema.properties.scripts.description,
    setScriptsEn.input_schema.properties.scripts.description,
    'scripts sub-schema の desc は ja/en で異なる'
);
// scripts.items 以下の description は無いので type は保持される
assert.strictEqual(setScriptsJa.input_schema.properties.scripts.items.type, 'object');
console.log('test5 OK: ネストした input_schema の description も localize される');

// --- description_i18n は出力に一切漏れない（オブジェクト全体 walk） ---
const walk = (obj, path) => {
    if (obj === null || typeof obj !== 'object') return;
    if (Array.isArray(obj)) { obj.forEach((v, i) => walk(v, `${path}[${i}]`)); return; }
    for (const [k, v] of Object.entries(obj)) {
        if (k === 'description_i18n') {
            assert.fail(`description_i18n leaked at ${path}.${k}`);
        }
        walk(v, `${path}.${k}`);
    }
};
walk(enTools, 'enTools');
walk(zhTools, 'zhTools');
console.log('test6 OK: description_i18n は出力オブジェクトに一切含まれない');

// --- BLOCK_TOOL_NAMES サイズは不変 ---
assert.strictEqual(BLOCK_TOOL_NAMES.size, 10, 'BLOCK_TOOL_NAMES は 10 件');
console.log('test7 OK: BLOCK_TOOL_NAMES.size === 10');

console.log('tools-i18n ALL TESTS PASSED');