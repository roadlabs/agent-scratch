// @scratch/scratch-gui の dist にネストされた webpack ランタイム(scratch-storage の
// fetch-worker ローダ)は publicPath が "/" にハードコードされており、サブパス配信
// (GitHub Pages の /vibecat/ など)では /chunks/fetch-worker...js が 404 になって
// アセット読み込みが永久に固まる。
// これをページのベースURL由来の publicPath に置き換える webpack ローダ。
module.exports = function fixNestedPublicPath(source) {
    const replacement =
        '.p=(typeof document!=="undefined"' +
        '?document.baseURI.replace(/[?#].*$/,"").replace(/[^/]*$/,"")' +
        ':"/")';
    const occurrences = source.split('.p="/"').length - 1;
    if (occurrences !== 1) {
        // dist更新で前提が変わったら気付けるように警告(ビルドは継続)
        this.emitWarning(new Error(
            `fix-nested-publicpath-loader: '.p="/"' の出現数が ${occurrences} 件でした(想定: 1件)。` +
            'scratch-gui のバージョンアップで構造が変わっていないか確認してください。'
        ));
    }
    return source.split('.p="/"').join(replacement);
};
