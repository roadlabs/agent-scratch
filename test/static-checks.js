// 過去に繰り返し混入したバグパターンの静的チェック
// (CLAUDE.md「よくあるハマりポイント」と対応)
//
// 検出目的:
//   1. ペン拡張ロード API: vm.runtime._extensions は存在しない
//   2. ToolError / BuildError にハードコードされた日本語/中国語（t() 経由を強制）
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const errors = [];

const checkFile = (relPath, forbidden, reason) => {
    const content = fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
    for (const pattern of forbidden) {
        if (content.includes(pattern)) {
            errors.push(`${relPath}: 禁止パターン "${pattern}" が含まれています — ${reason}`);
        }
    }
};

// ペン拡張ロードAPI: vm.runtime._extensions は存在しない(PR #11 で修正後、#16 で退行した実績あり)
checkFile(
    'src/agent/tool-handlers.js',
    ['runtime._extensions'],
    '正しくは vm.extensionManager.isExtensionLoaded() を使う'
);

// ToolError / BuildError のメッセージに非 ASCII 文字（日本語 / 中国語）が直接埋め込まれていないか検査。
// すべてのツールエラー文言は error-msgs.js の t() 経由で出力する設計。
// 許可例外: agent-loop.js / actor-loop.js の "未知のツール" / "Unknown tool" / "未知的工具" 4 箇所は
// 計画通り inline ternary で残している（数が少ない & 共有されない）ため除外。
const checkNoHardcodedErrorText = relPath => {
    const fullPath = path.join(__dirname, '..', relPath);
    const content = fs.readFileSync(fullPath, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, i) => {
        // 文字列リテラル内に漢字 / ひらがな / カタカナが含まれているか
        const hasJapanese = /[ぁ-んァ-ヶ一-龯]/.test(line);
        if (!hasJapanese) return;
        // 検査対象パターン: throw new ToolError(...) / throw new BuildError(...)
        // 文字列リテラルが throw 行に含まれているものを検出。
        if (/throw new (ToolError|BuildError)\(/.test(line)) {
            errors.push(`${relPath}:${i + 1}: ハードコード日本語検出 — error-msgs.js の t() を使う\n     ${line.trim()}`);
        }
    });
};

// handler / builder 系のみ検査（loop ファイルは inline ternary を許容）
checkNoHardcodedErrorText('src/agent/tool-handlers.js');
checkNoHardcodedErrorText('src/agent/runtime-handlers.js');
checkNoHardcodedErrorText('src/agent/block-builder.js');

if (errors.length > 0) {
    console.error('static-checks FAILED:');
    for (const e of errors) console.error(' -', e);
    process.exit(1);
}
console.log('static-checks OK');