// 各工具调用 → scratch-vm 的反映
import {buildScripts, dslFromBlocks, uid, BuildError} from './block-builder';
import {
    searchSprites, findSpriteByName,
    searchCostumes, findCostumeByName,
    searchSounds, findSoundByName,
    searchBackdrops, findBackdropByName
} from './library-search';
import {t as errT} from './error-msgs';

// fetch_url 工具用的代理基础 URL（兼作试用模式相同的 Worker）
const WORKER_BASE_URL = (() => {
    const raw = process.env.TRIAL_PROXY_URL || '';
    return raw.replace(/\/(v1\/)?chat\/completions$/, '').replace(/\/$/, '');
})();

const TRIAL_TOKEN_KEY = 'vibecat-trial-token';
const getTrialToken = () => localStorage.getItem(TRIAL_TOKEN_KEY) || '';

// 直接 fetch 的获取上限（防止上下文溢出）
const FETCH_URL_MAX_CHARS = 200 * 1024;

// 将 GitHub 的 URL 转换为允许 CORS 的获取目标（不符合则返回 null）
// - github.com/{o}/{r}/blob/{branch}/{path} → raw.githubusercontent.com
// - github.com/{o}/{r} (仓库根目录) → api.github.com 的 README(raw)
export const toCorsFetchable = url => {
    const blob = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/);
    if (blob) {
        return {url: `https://raw.githubusercontent.com/${blob[1]}/${blob[2]}/${blob[3]}/${blob[4]}`};
    }
    const root = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)\/?$/);
    if (root) {
        return {
            url: `https://api.github.com/repos/${root[1]}/${root[2]}/readme`,
            headers: {Accept: 'application/vnd.github.raw+json'}
        };
    }
    if (url.startsWith('https://raw.githubusercontent.com/') ||
        url.startsWith('https://api.github.com/')) {
        return {url};
    }
    return null;
};

// set_scripts 一次可组装的区块数上限（强制分阶段构建）
const MAX_BLOCKS_PER_CALL = 50;

export class ToolError extends Error {}

// 通过 name 或 id 查找目标（角色/舞台）。
// lang 用于 error-msgs 解析（targetNotFound）。
// 接受 stage / ステージ / Stage / 空 都视为舞台。
const findTarget = (vm, nameOrId, lang) => {
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
        throw new ToolError(errT('targetNotFound', lang, nameOrId, names));
    }
    return byName;
};

// 变量/列表/广播的解析（不存在则创建）。
// 变量・列表在舞台（全局）创建。
const makeVariableResolver = (vm, target) => (name, type) => {
    const stage = vm.runtime.getTargetForStage();
    const existing = target.lookupVariableByNameAndType(name, type, false) ||
        stage.lookupVariableByNameAndType(name, type, true);
    if (existing) return {id: existing.id, name: existing.name};
    const id = uid();
    stage.createVariable(id, name, type);
    return {id, name};
};

const targetSummary = target => {
    const summary = {
        name: target.getName(),
        is_stage: target.isStage,
        costumes: target.getCostumes().map(c => c.name),
        current_costume: target.getCostumes()[target.currentCostume] ?
            target.getCostumes()[target.currentCostume].name : null,
        sounds: target.getSounds().map(s => s.name),
        scripts: dslFromBlocks(target.blocks)
    };
    if (!target.isStage) {
        summary.x = Math.round(target.x);
        summary.y = Math.round(target.y);
        summary.size = target.size;
        summary.direction = target.direction;
        summary.visible = target.visible;
    }
    const variables = {};
    for (const v of Object.values(target.variables)) {
        if (v.type === '') variables[v.name] = v.value;
        else if (v.type === 'list') variables[v.name] = {list: v.value};
    }
    if (Object.keys(variables).length > 0) summary.variables = variables;
    return summary;
};

const blockGuard = (blocksEnabled, lang) => {
    if (!blocksEnabled) throw new ToolError(errT('blocksDisabled', lang));
};

export const createToolHandlers = (vm, {blocksEnabled = true, lang = 'ja'} = {}) => ({

    get_project_state: () => ({
        targets: vm.runtime.targets
            .filter(t => t.isOriginal)
            .map(targetSummary)
    }),

    search_library: ({kind, query}) => {
        if (!query) throw new ToolError(errT('queryRequired', lang));
        switch (kind) {
        case 'sprite': return {results: searchSprites(query)};
        case 'costume': return {results: searchCostumes(query)};
        case 'sound': return {results: searchSounds(query)};
        case 'backdrop': return {results: searchBackdrops(query)};
        default: throw new ToolError(errT('invalidKind', lang));
        }
    },

    add_sprite: async ({name}) => {
        blockGuard(blocksEnabled, lang);
        const item = findSpriteByName(name);
        if (!item) {
            const candidates = searchSprites(name, 5).map(s => s.name);
            throw new ToolError(errT('spriteNotFound', lang, name, candidates));
        }
        await vm.addSprite(JSON.stringify(item));
        const target = vm.editingTarget;
        return {
            added: target.getName(),
            costumes: target.getCostumes().map(c => c.name),
            sounds: target.getSounds().map(s => s.name)
        };
    },

    delete_sprite: ({target}) => {
        blockGuard(blocksEnabled, lang);
        const t = findTarget(vm, target, lang);
        if (t.isStage) throw new ToolError(errT('stageCannotDelete', lang));
        vm.deleteSprite(t.id);
        return {deleted: target};
    },

    rename_sprite: ({target, new_name}) => {
        blockGuard(blocksEnabled, lang);
        const t = findTarget(vm, target, lang);
        if (t.isStage) throw new ToolError(errT('stageCannotRename', lang));
        vm.renameSprite(t.id, new_name);
        return {renamed: new_name};
    },

    add_costume: async ({target, costume_name}) => {
        blockGuard(blocksEnabled, lang);
        const t = findTarget(vm, target, lang);
        const item = findCostumeByName(costume_name);
        if (!item) {
            const candidates = searchCostumes(costume_name, 5).map(c => c.name);
            throw new ToolError(errT('costumeNotFound', lang, costume_name, candidates));
        }
        const costume = {...item, randomizeName: false};
        await vm.addCostume(item.md5ext, costume, t.id);
        return {added: costume_name, costumes: t.getCostumes().map(c => c.name)};
    },

    add_sound: async ({target, sound_name}) => {
        blockGuard(blocksEnabled, lang);
        const t = findTarget(vm, target, lang);
        const item = findSoundByName(sound_name);
        if (!item) {
            const candidates = searchSounds(sound_name, 5).map(s => s.name);
            throw new ToolError(errT('soundNotFound', lang, sound_name, candidates));
        }
        await vm.addSound({...item}, t.id);
        return {added: sound_name, sounds: t.getSounds().map(s => s.name)};
    },

    add_backdrop: async ({backdrop_name}) => {
        blockGuard(blocksEnabled, lang);
        const item = findBackdropByName(backdrop_name);
        if (!item) {
            const candidates = searchBackdrops(backdrop_name, 5).map(b => b.name);
            throw new ToolError(errT('backdropNotFound', lang, backdrop_name, candidates));
        }
        await vm.addBackdrop(item.md5ext, {...item});
        return {added: backdrop_name};
    },

    set_scripts: async ({target, scripts, append}) => {
        blockGuard(blocksEnabled, lang);
        const t = findTarget(vm, target, lang);
        const resolveVariable = makeVariableResolver(vm, t);

        // 如果脚本内包含 pen_ 区块，则自动加载画笔扩展
        const scriptJson = JSON.stringify(scripts);
        // 注意：runtime 直下的「_extensions」不存在（参见 CLAUDE.md「常见陷阱」）。
        // 务必使用 vm.extensionManager.isExtensionLoaded（过去2次回退・test/static-checks.js 检测到）
        if (scriptJson.includes('"pen_') && !vm.extensionManager.isExtensionLoaded('pen')) {
            await vm.extensionManager.loadExtensionURL('pen');
        }

        // 菜单/字段的动态允许值（存在的角色名/造型名等）
        const stage = vm.runtime.getTargetForStage();
        const dynamicValues = {
            sprites: vm.runtime.targets
                .filter(x => x.isOriginal && !x.isStage)
                .map(x => x.getName()),
            costumes: t.getCostumes().map(c => c.name),
            sounds: t.getSounds().map(snd => snd.name),
            backdrops: stage ? stage.getCostumes().map(c => c.name) : []
        };

        // 失败时回滚用的快照
        const blocksSnapshot = {...t.blocks._blocks};
        const scriptsSnapshot = [...t.blocks._scripts];
        let newBlocks;
        try {
            newBlocks = buildScripts(scripts, {resolveVariable, dynamicValues});
        } catch (e) {
            t.blocks._blocks = blocksSnapshot;
            t.blocks._scripts = scriptsSnapshot;
            t.blocks.resetCache();
            if (e instanceof BuildError) {
                throw new ToolError(errT(e.errorKey, lang, ...e.errorArgs));
            }
            throw e;
        }

        // 限制一次可组装的量（防止巨大脚本的一键生成，强制分阶段构建）
        const realCount = Object.values(newBlocks).filter(b => !b.shadow).length;
        if (realCount > MAX_BLOCKS_PER_CALL) {
            t.blocks._blocks = blocksSnapshot;
            t.blocks._scripts = scriptsSnapshot;
            t.blocks.resetCache();
            throw new ToolError(errT('tooManyBlocks', lang, realCount, MAX_BLOCKS_PER_CALL));
        }

        // 在替换之前停止引用旧区块的运行中线程
        //（如果残留，_updateGlows 会尝试给已删除的区块 ID 发光，
        //  导致每帧都出现"Tried to glow block that does not exist"）
        vm.runtime.stopForTarget(t);
        if (append) {
            // 将新脚本配置在现有脚本下方
            const existingTops = t.blocks.getScripts()
                .map(id => t.blocks.getBlock(id))
                .filter(Boolean);
            const offsetY = existingTops.length
                ? Math.max(...existingTops.map(b => b.y || 0)) + 320
                : 0;
            for (const block of Object.values(newBlocks)) {
                if (block.topLevel) block.y = (block.y || 0) + offsetY;
            }
        } else {
            t.blocks.deleteAllBlocks();
        }
        for (const block of Object.values(newBlocks)) {
            t.blocks.createBlock(block);
        }
        // 清除前一帧的 glow 引用中残留的旧区块 ID
        vm.runtime._scriptGlowsPreviousFrame = [];
        vm.setEditingTarget(t.id);
        vm.emitWorkspaceUpdate();
        const scriptCount = t.blocks.getScripts().length;
        return {ok: true, target: t.getName(), appended: !!append, script_count: scriptCount};
    },

    set_sprite_properties: ({target, x, y, size, direction, visible}) => {
        blockGuard(blocksEnabled, lang);
        const t = findTarget(vm, target, lang);
        if (t.isStage) throw new ToolError(errT('stageCannotSetProperties', lang));
        if (typeof x === 'number' || typeof y === 'number') {
            t.setXY(typeof x === 'number' ? x : t.x, typeof y === 'number' ? y : t.y);
        }
        if (typeof size === 'number') t.setSize(size);
        if (typeof direction === 'number') t.setDirection(direction);
        if (typeof visible === 'boolean') t.setVisible(visible);
        return {ok: true, x: t.x, y: t.y, size: t.size, direction: t.direction, visible: t.visible};
    },

    start_project: () => {
        blockGuard(blocksEnabled, lang);
        vm.greenFlag();
        return {ok: true};
    },

    stop_project: () => {
        blockGuard(blocksEnabled, lang);
        vm.stopAll();
        return {ok: true};
    },

    fetch_url: async ({url}) => {
        if (!url) throw new ToolError(errT('urlRequired', lang));

        // 将 GitHub 的 URL 转换为允许 CORS 的端点，从浏览器直接获取
        //（因为 Worker 代理需要试用令牌，使用自己的密钥的用户也能运行）
        const direct = toCorsFetchable(url);
        const token = getTrialToken();
        const useProxy = !direct && WORKER_BASE_URL && token;

        let endpoint;
        let headers;
        if (direct) {
            endpoint = direct.url;
            headers = direct.headers;
        } else if (useProxy) {
            // GitHub 以外的 URL 经由代理（仅在有试用令牌时）
            endpoint = `${WORKER_BASE_URL}/fetch-url?url=${encodeURIComponent(url)}`;
            headers = {Authorization: `Bearer ${token}`};
        } else {
            // 尝试直接 fetch（如果是有 CORS 许可的网站则成功）
            endpoint = url;
        }

        let res;
        try {
            res = await fetch(endpoint, headers ? {headers} : undefined);
        } catch (e) {
            throw new ToolError(errT('networkError', lang, e.message, !(direct || useProxy)));
        }
        if (!res.ok) {
            let errMsg = `HTTP ${res.status}`;
            try { const body = await res.json(); errMsg = body.error || errMsg; } catch { /* ignore */ }
            throw new ToolError(errT('fetchFailed', lang, errMsg, endpoint));
        }
        let data;
        if (useProxy) {
            data = await res.json();
        } else {
            const text = (await res.text()).slice(0, FETCH_URL_MAX_CHARS);
            data = {text, truncated: text.length >= FETCH_URL_MAX_CHARS};
        }
        return {
            url,
            text: data.text,
            truncated: data.truncated || false
        };
    }
});