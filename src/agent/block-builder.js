// 简易 DSL → scratch-vm 的运行时区块格式的转换，及其逆转换
//
// DSL 格式:
//   scripts: [
//     {x?, y?, blocks: [
//       {"opcode": "event_whenflagclicked"},
//       {"opcode": "control_forever", "substack": [
//         {"opcode": "motion_movesteps", "inputs": {"STEPS": 10}}
//       ]}
//     ]}
//   ]
// inputs 的值可以是字面量（数字/字符串）或嵌套的区块对象({"opcode": ...})。
// fields 的值是字符串（下拉菜单选项、变量名等）。

import {BLOCK_SPECS, LITERAL_SHADOWS} from './block-specs';

const SOUP = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export const uid = () => Array.from(
    {length: 20}, () => SOUP[Math.floor(Math.random() * SOUP.length)]
).join('');

// BuildError 不携带本地化文本（避免在 throw 点嵌入日语/中文/英文）；
// 只携带 errorKey 与参数，由调用方的 handler 在抛出 ToolError 时按 lang 解析。
// 解析通过 t(key, lang, ...errorArgs) 完成（见 ./error-msgs）。
export class BuildError extends Error {
    constructor (errorKey, ...errorArgs) {
        super(errorKey);
        this.errorKey = errorKey;
        this.errorArgs = errorArgs;
    }
}

const isBlockDef = v => v !== null && typeof v === 'object' && typeof v.opcode === 'string';

/**
 * DSLのscripts配列をランタイムブロック形式(idをキーとするマップ)へ変換する。
 * @param {Array} scripts DSLのスクリプト配列
 * @param {object} ctx
 * @param {function(string, string): {id: string, name: string}} ctx.resolveVariable
 *        変数/リスト/ブロードキャスト名 → {id, name}(存在しなければ作成)
 * @returns {object} {id: runtimeBlock} のマップ
 */
export const buildScripts = (scripts, ctx) => {
    if (!Array.isArray(scripts)) {
        throw new BuildError('scriptsNotArray');
    }
    const blocks = {};
    scripts.forEach((script, i) => {
        const stack = Array.isArray(script) ? script : script.blocks;
        if (!Array.isArray(stack) || stack.length === 0) {
            throw new BuildError('scriptsMissingBlocks', i);
        }
        const topId = buildStack(stack, null, blocks, ctx, `scripts[${i}]`);
        const top = blocks[topId];
        top.topLevel = true;
        top.x = typeof script.x === 'number' ? script.x : 60 + (i % 2) * 380;
        top.y = typeof script.y === 'number' ? script.y : 60 + Math.floor(i / 2) * 320;
    });
    return blocks;
};

// 构建区块列并返回首个区块 id（连接 next/parent）
const buildStack = (defs, parentId, blocks, ctx, path) => {
    let firstId = null;
    let prevId = null;
    defs.forEach((def, i) => {
        const id = buildBlock(def, blocks, ctx, `${path}.blocks[${i}]`);
        const block = blocks[id];
        const spec = BLOCK_SPECS[def.opcode];
        if (spec.shape === 'reporter' || spec.shape === 'boolean') {
            throw new BuildError('valueBlockInStack', path, def.opcode);
        }
        if (i > 0 && spec.shape === 'hat') {
            throw new BuildError('hatNotAtTop', path, def.opcode);
        }
        if (prevId !== null) {
            blocks[prevId].next = id;
            block.parent = prevId;
        } else {
            block.parent = parentId;
            firstId = id;
        }
        prevId = id;
    });
    return firstId;
};

// 构建单一区块（+shadow、嵌套区块、substack）并返回 id
const buildBlock = (def, blocks, ctx, path) => {
    if (!isBlockDef(def)) {
        throw new BuildError('invalidBlockDef', path);
    }
    const spec = BLOCK_SPECS[def.opcode];
    if (!spec) {
        throw new BuildError('unknownOpcode', path, def.opcode);
    }
    const id = uid();
    const block = {
        id,
        opcode: def.opcode,
        inputs: {},
        fields: {},
        next: null,
        parent: null,
        shadow: false,
        topLevel: false
    };
    blocks[id] = block;

    const givenInputs = def.inputs || {};
    const givenFields = def.fields || {};

    // 参数(inputs)
    for (const [name, argType] of Object.entries(spec.args || {})) {
        // 接受 Claude 写在 inputs/fields 任意一个的位置
        const value = givenInputs[name] !== undefined ? givenInputs[name] : givenFields[name];
        block.inputs[name] = buildInput(name, argType, value, id, blocks, ctx, `${path}.inputs.${name}`);
    }

    // 字段（下拉菜单・变量引用）
    for (const [name, fieldSpec] of Object.entries(spec.fields || {})) {
        const value = givenFields[name] !== undefined ? givenFields[name] : givenInputs[name];
        if (value === undefined || value === null) {
            throw new BuildError('fieldRequired', path, def.opcode, name);
        }
        if (typeof value === 'object') {
            throw new BuildError('fieldNotBlock', path, name);
        }
        block.fields[name] = buildField(name, fieldSpec, String(value), ctx, `${path}.fields.${name}`);
    }

    // C 型区块的内含堆栈
    const substackCount = spec.substacks || 0;
    if (substackCount >= 1) {
        const sub = def.substack || def.SUBSTACK;
        if (Array.isArray(sub) && sub.length > 0) {
            const subId = buildStack(sub, id, blocks, ctx, `${path}.substack`);
            block.inputs.SUBSTACK = {name: 'SUBSTACK', block: subId, shadow: null};
        }
    }
    if (substackCount >= 2) {
        const sub2 = def.substack2 || def.else || def.SUBSTACK2;
        if (Array.isArray(sub2) && sub2.length > 0) {
            const sub2Id = buildStack(sub2, id, blocks, ctx, `${path}.substack2`);
            block.inputs.SUBSTACK2 = {name: 'SUBSTACK2', block: sub2Id, shadow: null};
        }
    }

    // control_stop 的 mutation
    if (spec.mutationStop) {
        const stopOption = block.fields.STOP_OPTION ? block.fields.STOP_OPTION.value : 'all';
        block.mutation = {
            tagName: 'mutation',
            children: [],
            hasnext: stopOption === 'other scripts in sprite' ? 'true' : 'false'
        };
    }

    return id;
};

// 选择值的验证（values: 静态允许值 / dynamic: VM 衍生的允许值类别）
// 有 dynamic 指定但没有 ctx.dynamicValues 时（如无 VM 的测试等）不验证
const validateChoice = (spec, value, ctx, path, what) => {
    if (!spec.values && !spec.dynamic) return;
    if (spec.dynamic && !ctx.dynamicValues) return;
    const dynamicList = (spec.dynamic && ctx.dynamicValues && ctx.dynamicValues[spec.dynamic]) || [];
    const allowed = [...(spec.values || []), ...dynamicList];
    if (allowed.includes(String(value))) return;
    throw new BuildError('invalidChoice', path, what, value, allowed);
};

// 构建一个 input（字面量 shadow / 菜单 shadow / 嵌套区块）
const buildInput = (name, argType, value, parentId, blocks, ctx, path) => {
    // boolean 输入：仅嵌套区块，无 shadow
    if (argType === 'boolean') {
        if (value === undefined || value === null) {
            return {name, block: null, shadow: null};
        }
        if (!isBlockDef(value)) {
            throw new BuildError('booleanInputNeedsBlock', path);
        }
        const nestedId = buildReporter(value, parentId, blocks, ctx, path, true);
        return {name, block: nestedId, shadow: null};
    }

    // 菜单输入：菜单 shadow（+可选嵌套区块）
    if (typeof argType === 'object' && argType.menu) {
        const isNested = isBlockDef(value);
        const menuValue = isNested || value === undefined || value === null ?
            argType.default :
            String(value);
        if (!isNested) {
            validateChoice(argType, menuValue, ctx, path, name);
        }
        const shadowId = uid();
        blocks[shadowId] = {
            id: shadowId,
            opcode: argType.menu,
            inputs: {},
            fields: {[argType.field]: {name: argType.field, value: menuValue}},
            next: null,
            parent: parentId,
            shadow: true,
            topLevel: false
        };
        if (isNested) {
            const nestedId = buildReporter(value, parentId, blocks, ctx, path, false);
            return {name, block: nestedId, shadow: shadowId};
        }
        return {name, block: shadowId, shadow: shadowId};
    }

    // 广播输入
    if (argType === 'broadcast') {
        if (value === undefined || value === null || isBlockDef(value)) {
            throw new BuildError('broadcastNameRequired', path);
        }
        const broadcast = ctx.resolveVariable(String(value), 'broadcast_msg');
        const shadowId = uid();
        blocks[shadowId] = {
            id: shadowId,
            opcode: 'event_broadcast_menu',
            inputs: {},
            fields: {
                BROADCAST_OPTION: {
                    name: 'BROADCAST_OPTION',
                    value: broadcast.name,
                    id: broadcast.id,
                    variableType: 'broadcast_msg'
                }
            },
            next: null,
            parent: parentId,
            shadow: true,
            topLevel: false
        };
        return {name, block: shadowId, shadow: shadowId};
    }

    // 字面量输入（数字・字符串・颜色）
    const literalSpec = LITERAL_SHADOWS[argType];
    if (!literalSpec) {
        throw new BuildError('unknownArgType', path, JSON.stringify(argType));
    }
    const isNested = isBlockDef(value);
    const shadowValue = isNested || value === undefined || value === null ? '' : String(value);
    if (argType === 'color' && !isNested && shadowValue !== '' &&
        !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(shadowValue)) {
        throw new BuildError('colorFormat', path);
    }
    const shadowId = uid();
    blocks[shadowId] = {
        id: shadowId,
        opcode: literalSpec.opcode,
        inputs: {},
        fields: {[literalSpec.field]: {name: literalSpec.field, value: shadowValue}},
        next: null,
        parent: parentId,
        shadow: true,
        topLevel: false
    };
    if (isNested) {
        const nestedId = buildReporter(value, parentId, blocks, ctx, path, false);
        return {name, block: nestedId, shadow: shadowId};
    }
    return {name, block: shadowId, shadow: shadowId};
};

// 构建嵌套在 input内的值区块
const buildReporter = (def, parentId, blocks, ctx, path, requireBoolean) => {
    const spec = BLOCK_SPECS[def.opcode];
    if (!spec) {
        throw new BuildError('unknownOpcode', path, def.opcode);
    }
    if (spec.shape !== 'reporter' && spec.shape !== 'boolean') {
        throw new BuildError('notValueBlock', path, def.opcode);
    }
    if (requireBoolean && spec.shape !== 'boolean') {
        throw new BuildError('booleanInputNeedsBooleanBlock', path, def.opcode);
    }
    const id = buildBlock(def, blocks, ctx, path);
    blocks[id].parent = parentId;
    return id;
};

// 构建字段值（变量系则解析 id）
const buildField = (name, fieldSpec, value, ctx, path) => {
    if (fieldSpec.variable !== undefined) {
        const variable = ctx.resolveVariable(value, fieldSpec.variable);
        return {name, value: variable.name, id: variable.id, variableType: fieldSpec.variable};
    }
    validateChoice(fieldSpec, value, ctx, path || '', name);
    return {name, value};
};

// ---- 逆转换：运行时区块 → DSL（用于 get_project_state 的摘要） ----

/**
 * targetのBlocksコンテナをDSL形式に逆変換する。
 * @param {object} blocksContainer target.blocks
 * @returns {Array} DSLのscripts配列
 */
export const dslFromBlocks = blocksContainer => {
    const all = blocksContainer._blocks;
    return blocksContainer.getScripts().map(topId => {
        const top = all[topId];
        return {
            x: top.x,
            y: top.y,
            blocks: stackToDsl(topId, all)
        };
    });
};

const stackToDsl = (startId, all) => {
    const result = [];
    let id = startId;
    while (id) {
        const block = all[id];
        if (!block) break;
        result.push(blockToDsl(block, all));
        id = block.next;
    }
    return result;
};

const blockToDsl = (block, all) => {
    const def = {opcode: block.opcode};
    const inputs = {};
    for (const [name, input] of Object.entries(block.inputs || {})) {
        if (name === 'SUBSTACK' || name === 'SUBSTACK2') {
            const key = name === 'SUBSTACK' ? 'substack' : 'substack2';
            if (input.block) def[key] = stackToDsl(input.block, all);
            continue;
        }
        if (!input.block) continue;
        const child = all[input.block];
        if (!child) continue;
        if (child.shadow) {
            // shadow 区块 → 字面量值
            const field = Object.values(child.fields || {})[0];
            if (field) inputs[name] = field.value;
        } else {
            inputs[name] = blockToDsl(child, all);
        }
    }
    if (Object.keys(inputs).length > 0) def.inputs = inputs;
    const fields = {};
    for (const [name, field] of Object.entries(block.fields || {})) {
        fields[name] = field.value;
    }
    if (Object.keys(fields).length > 0) def.fields = fields;
    return def;
};
