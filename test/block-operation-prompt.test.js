/* eslint-disable no-console */
import assert from 'assert';
import {getBlockOperationPrompt, getSystemPrompt} from '../src/agent/system-prompt.js';

// --- 日本語(既定) ---
const enabled = getBlockOperationPrompt(true);
assert.ok(enabled.includes('現在、ブロック操作はオンです'));
assert.ok(enabled.includes('過去の状態'));
assert.ok(enabled.includes('直接実行してください'));
assert.ok(!enabled.includes('現在、ブロック操作はオフです'));

const disabled = getBlockOperationPrompt(false);
assert.ok(disabled.includes('現在、ブロック操作はオフです'));
assert.ok(disabled.includes('説明・解説だけ'));
assert.ok(!disabled.includes('現在、ブロック操作はオンです'));

// --- 英語 ---
const enabledEn = getBlockOperationPrompt(true, 'en');
assert.ok(enabledEn.includes('Block editing is currently ON'));
assert.ok(!/[ぁ-んァ-ヶ一-龯]/.test(enabledEn), '英語プロンプトに日本語が混ざらない');

const disabledEn = getBlockOperationPrompt(false, 'en');
assert.ok(disabledEn.includes('Block editing is currently OFF'));
assert.ok(disabledEn.includes('only explain and describe'));

// --- 中文 ---
const enabledZh = getBlockOperationPrompt(true, 'zh');
assert.ok(enabledZh.includes('区块操作目前处于开启状态'), '中文 enabled プロンプト');
assert.ok(!/[ぁ-んァ-ヶ]/.test(enabledZh), '中文プロンプトにひらがな・カタカナが混ざらない');

const disabledZh = getBlockOperationPrompt(false, 'zh');
assert.ok(disabledZh.includes('区块操作目前处于关闭状态'), '中文 disabled プロンプト');
assert.ok(disabledZh.includes('说明和讲解'), '中文 disabled では説明モード');

// --- システムプロンプト本体の日中英切替 ---
const sysJa = getSystemPrompt('ja');
const sysEn = getSystemPrompt('en');
const sysZh = getSystemPrompt('zh');
assert.ok(sysJa.includes('あなたはScratchプログラミングのエキスパート'), '日本語システムプロンプト');
assert.ok(sysEn.includes('expert Scratch programming agent'), '英語システムプロンプト');
assert.ok(sysZh.includes('Scratch 编程助手'), '中文システムプロンプト');
assert.ok(getSystemPrompt() === sysJa, '既定は日本語');
// opcode 一覧は全言語に含まれる(BLOCK_SPECS 由来)
assert.ok(sysEn.includes('motion_movesteps') && sysJa.includes('motion_movesteps') && sysZh.includes('motion_movesteps'));
// 英語版のフィールド注記が英語化されている
assert.ok(sysEn.includes('variable name'), 'en では variable name');

console.log('block-operation-prompt ALL TESTS PASSED');
