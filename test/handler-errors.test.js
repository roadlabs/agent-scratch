// handler 抛出的 ToolError / BuildError の i18n 検証
/* eslint-disable no-console */
import assert from 'assert';
import {createToolHandlers, ToolError} from '../src/agent/tool-handlers.js';
import {createRuntimeToolHandlers} from '../src/agent/runtime-handlers.js';
import {BuildError} from '../src/agent/block-builder.js';
import {t as errT} from '../src/agent/error-msgs.js';

// 最小限の mock VM。findTarget が走れる程度の targets だけ用意。
const stageMock = {isOriginal: true, isStage: true, id: 's', getName: () => 'Stage',
    x: 0, y: 0, direction: 90, size: 100, visible: true, currentCostume: 0,
    getCostumes: () => [{name: 'cat1'}], getSounds: () => [],
    setXY: function () {}, setDirection: function () {}, setVisible: function () {},
    setSize: function () {}, setCostume: function () {return true;},
    goToFront: function () {}, goToBack: function () {},
    getCustomState: function () {return null;}, setCustomState: function () {}};
const spriteMock = {...stageMock, isStage: false, id: 'sp', getName: () => 'Cat'};
const makeVm = () => ({
    runtime: {
        getTargetForStage: () => stageMock,
        getTargetById: () => null,
        targets: [stageMock, spriteMock],
        ioDevices: null,
        getOpcodeFunction: () => null
    },
    extensionManager: {isExtensionLoaded: () => false, loadExtensionURL: () => Promise.resolve()},
    duplicateSprite: () => Promise.resolve(spriteMock),
    greenFlag: () => {},
    stopAll: () => {}
});

// 同期ハンドラ用: 直接 throw される
const assertLocalizedSync = (action, langs, label, opts = {}) => {
    for (const lang of langs) {
        const h = createToolHandlers(makeVm(), {lang, ...opts});
        try { action(h); assert.fail(`${label} (${lang}): エラーになるべき`); }
        catch (e) {
            assert.ok(e instanceof ToolError, `${label} (${lang}): ToolError 型`);
            assert.ok(e.message && e.message.length > 0, `${label} (${lang}): message 非空`);
        }
    }
};

// 非同期ハンドラ用: Promise rejection を catch する
const assertLocalizedAsync = async (action, langs, label, opts = {}) => {
    for (const lang of langs) {
        const h = createToolHandlers(makeVm(), {lang, ...opts});
        try {
            await action(h);
            assert.fail(`${label} (${lang}): reject されるべき`);
        } catch (e) {
            assert.ok(e instanceof ToolError, `${label} (${lang}): ToolError 型`);
            assert.ok(e.message && e.message.length > 0, `${label} (${lang}): message 非空`);
        }
    }
};

// runtime 用（同期 throw）
const assertRuntimeLocalized = (action, langs, label) => {
    for (const lang of langs) {
        const h = createRuntimeToolHandlers(makeVm(), {lang});
        try { action(h); assert.fail(`${label} (${lang}): エラーになるべき`); }
        catch (e) {
            assert.ok(e instanceof ToolError, `${label} (${lang}): ToolError 型`);
            assert.ok(e.message && e.message.length > 0, `${label} (${lang}): message 非空`);
        }
    }
};

// runtime 用（非同期 reject）
const assertRuntimeLocalizedAsync = async (action, langs, label) => {
    for (const lang of langs) {
        const h = createRuntimeToolHandlers(makeVm(), {lang});
        try {
            await action(h);
            assert.fail(`${label} (${lang}): reject されるべき`);
        } catch (e) {
            assert.ok(e instanceof ToolError, `${label} (${lang}): ToolError 型`);
            assert.ok(e.message && e.message.length > 0, `${label} (${lang}): message 非空`);
        }
    }
};

// async fetch_url があるので全体を IIFE で包む（CJS output は top-level await 非対応）
(async () => {
    // --- 程序员模式: 6 件 × 3 lang ---
    assertLocalizedSync(h => h.search_library({kind: 'sprite'}), ['ja', 'en', 'zh'], 'queryRequired');
    assertLocalizedSync(h => h.start_project(), ['ja', 'en', 'zh'], 'blocksDisabled', {blocksEnabled: false});
    assertLocalizedSync(h => h.delete_sprite({target: 'Stage'}), ['ja', 'en', 'zh'], 'stageCannotDelete');
    assertLocalizedSync(h => h.rename_sprite({target: 'Stage', new_name: 'X'}), ['ja', 'en', 'zh'], 'stageCannotRename');
    await assertLocalizedAsync(h => h.fetch_url({}), ['ja', 'en', 'zh'], 'urlRequired');
    assertLocalizedSync(h => h.search_library({kind: 'invalid', query: 'foo'}), ['ja', 'en', 'zh'], 'invalidKind');
    console.log('test1 OK: 程序员模式 ToolError 6 件 × 3 lang すべてメッセージあり');

    // --- actor 模式: 7 件 × 3 lang ---
    assertRuntimeLocalized(h => h.actor_move({target: 'Stage', dx: 1, dy: 0}), ['ja', 'en', 'zh'], 'stageCannotMove');
    assertRuntimeLocalized(h => h.actor_turn({target: 'Stage', degrees: 10}), ['ja', 'en', 'zh'], 'stageCannotTurn');
    assertRuntimeLocalized(h => h.actor_set_position({target: 'Stage', x: 0, y: 0}), ['ja', 'en', 'zh'], 'stageCannotSetPosition');
    assertRuntimeLocalized(h => h.actor_set_direction({target: 'Stage', direction: 90}), ['ja', 'en', 'zh'], 'stageCannotSetDirection');
    assertRuntimeLocalized(h => h.actor_set_size({target: 'Stage', size: 50}), ['ja', 'en', 'zh'], 'stageCannotSetSize');
    assertRuntimeLocalized(h => h.actor_set_layer({target: 'Cat', layer: 'middle'}), ['ja', 'en', 'zh'], 'invalidLayer');
    await assertRuntimeLocalizedAsync(h => h.actor_ensure_extension({extension_id: 'bogus'}), ['ja', 'en', 'zh'], 'invalidExtensionId');
    console.log('test2 OK: actor 模式 ToolError 7 件 × 3 lang すべてメッセージあり');

    // --- BuildError → t() で localized ---
    for (const lang of ['ja', 'en', 'zh']) {
        const be = new BuildError('unknownOpcode', 'scripts[0]', 'fake_op');
        const localized = errT(be.errorKey, lang, ...be.errorArgs);
        assert.ok(localized.includes('fake_op'), `${lang}: 参数(${be.errorArgs})が埋め込まれている`);
        assert.ok(localized.length > 0, `${lang}: localized message 非空`);
    }
    console.log('test3 OK: BuildError + t() で lang ごとに localized 文字列が生成される');

    // --- 同一エラーが ja/en/zh で互いに異なる（コピー漏れ検出） ---
    const enMsg = errT('stageCannotMove', 'en');
    const zhMsg = errT('stageCannotMove', 'zh');
    const jaMsg = errT('stageCannotMove', 'ja');
    assert.notStrictEqual(enMsg, zhMsg);
    assert.notStrictEqual(enMsg, jaMsg);
    assert.notStrictEqual(jaMsg, zhMsg);
    console.log('test4 OK: 同一 errorKey の ja/en/zh は互いに異なる');

    console.log('handler-errors ALL TESTS PASSED');
})();