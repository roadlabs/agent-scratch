/* eslint-disable no-console */
import assert from 'assert';
import {localeToLang, STRINGS, SUGGESTIONS_BY_LANG, draftingChars, errorPrefix, pricingLabel} from '../src/i18n.js';
import {ERROR_MSGS, t as errT} from '../src/agent/error-msgs.js';

// --- localeToLang: 日本語系は ja、中文系は zh、それ以外は en ---
assert.strictEqual(localeToLang('ja'), 'ja');
assert.strictEqual(localeToLang('ja-Hira'), 'ja');
assert.strictEqual(localeToLang('en'), 'en');
assert.strictEqual(localeToLang('en-US'), 'en');
assert.strictEqual(localeToLang('fr'), 'en');
assert.strictEqual(localeToLang('zh'), 'zh');
assert.strictEqual(localeToLang('zh-cn'), 'zh');
assert.strictEqual(localeToLang('zh-TW'), 'zh');
assert.strictEqual(localeToLang(''), 'en');
assert.strictEqual(localeToLang(null), 'en');
assert.strictEqual(localeToLang(undefined), 'en');

// --- STRINGS: ja/en/zh が同じキー集合を持つ(片方だけ更新する事故を防ぐ) ---
const jaKeys = Object.keys(STRINGS.ja).sort();
const enKeys = Object.keys(STRINGS.en).sort();
const zhKeys = Object.keys(STRINGS.zh).sort();
assert.deepStrictEqual(jaKeys, enKeys, 'STRINGS.ja と STRINGS.en のキー集合は一致すること');
assert.deepStrictEqual(jaKeys, zhKeys, 'STRINGS.ja と STRINGS.zh のキー集合は一致すること');
for (const k of jaKeys) {
    assert.ok(STRINGS.ja[k] && typeof STRINGS.ja[k] === 'string', `ja.${k} は非空文字列`);
    assert.ok(STRINGS.en[k] && typeof STRINGS.en[k] === 'string', `en.${k} は非空文字列`);
    assert.ok(STRINGS.zh[k] && typeof STRINGS.zh[k] === 'string', `zh.${k} は非空文字列`);
    assert.notStrictEqual(STRINGS.ja[k], STRINGS.en[k], `ja.${k} と en.${k} は異なる訳であること`);
    assert.notStrictEqual(STRINGS.ja[k], STRINGS.zh[k], `ja.${k} と zh.${k} は異なる訳であること`);
}

// --- サジェストは全言語で同数。en は日本語特有の題材(nekonige)を含まない ---
assert.strictEqual(SUGGESTIONS_BY_LANG.ja.length, SUGGESTIONS_BY_LANG.en.length);
assert.strictEqual(SUGGESTIONS_BY_LANG.ja.length, SUGGESTIONS_BY_LANG.zh.length);
for (const s of SUGGESTIONS_BY_LANG.en) {
    assert.ok(!/nekonige|ネコ逃げ/.test(s.text), 'en サジェストは nekonige を含まない');
    assert.ok(!/[ぁ-んァ-ヶ一-龯]/.test(s.label + s.text), 'en サジェストは日本語を含まない');
}

// --- ヘルパー関数 ---
assert.strictEqual(draftingChars('ja', 0), '');
assert.strictEqual(draftingChars('ja', 12), ' (12文字)');
assert.strictEqual(draftingChars('en', 12), ' (12 chars)');
assert.strictEqual(draftingChars('zh', 12), ' (12个字符)');
assert.strictEqual(errorPrefix('ja', 'X'), 'エラー: X');
assert.strictEqual(errorPrefix('en', 'X'), 'Error: X');
assert.strictEqual(errorPrefix('zh', 'X'), '错误: X');
assert.ok(pricingLabel('ja', 'Anthropic').includes('料金表'));
assert.ok(pricingLabel('en', 'Anthropic').includes('pricing'));
assert.ok(pricingLabel('zh', 'Anthropic').includes('价格表'));

// --- error-msgs: 集中错误目录的三语对齐 ---
// 所有静态条目（function 除外）都有 ja/en/zh 三个非空字符串。
for (const [key, entry] of Object.entries(ERROR_MSGS)) {
    if (typeof entry === 'function') continue; // 参数化条目跳过
    assert.ok(entry.ja && typeof entry.ja === 'string', `ERROR_MSGS.${key}.ja 非空`);
    assert.ok(entry.en && typeof entry.en === 'string', `ERROR_MSGS.${key}.en 非空`);
    assert.ok(entry.zh && typeof entry.zh === 'string', `ERROR_MSGS.${key}.zh 非空`);
    assert.notStrictEqual(entry.ja, entry.en, `ERROR_MSGS.${key} ja/en 不同`);
    assert.notStrictEqual(entry.ja, entry.zh, `ERROR_MSGS.${key} ja/zh 不同`);
}

// t() helper: 三语各自正确解析；未知 lang 走 ja fallback；未知 key 返回占位
assert.strictEqual(errT('stageCannotMove', 'ja'), ERROR_MSGS.stageCannotMove.ja);
assert.strictEqual(errT('stageCannotMove', 'en'), ERROR_MSGS.stageCannotMove.en);
assert.strictEqual(errT('stageCannotMove', 'zh'), ERROR_MSGS.stageCannotMove.zh);
assert.strictEqual(errT('stageCannotMove', 'fr'), ERROR_MSGS.stageCannotMove.ja);
// 未知 key 返回占位（包含 key 本身便于排查）
assert.ok(errT('nonsenseKey_xyz', 'ja').includes('nonsenseKey_xyz'));
// 参数化条目（函数形式）按参数填充
assert.ok(errT('targetNotFound', 'en', 'Foo', ['Stage', 'Cat']).includes('Foo'));
assert.ok(errT('targetNotFound', 'en', 'Foo', ['Stage', 'Cat']).includes('Stage'));
assert.ok(errT('targetNotFound', 'en', 'Foo', ['Stage', 'Cat']).includes('Cat'));
assert.ok(errT('targetNotFound', 'ja', 'Foo', ['Stage', 'Cat']).includes('Foo'));
assert.ok(errT('targetNotFound', 'zh', 'Foo', ['Stage', 'Cat']).includes('Foo'));

console.log('i18n ALL TESTS PASSED');
