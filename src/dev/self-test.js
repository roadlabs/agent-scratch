// ?selftest=1 用于开发时验证 VM 工具处理器（不依赖 Claude）的脚本
// ?agenttest=1 用于 E2E 验证经过试用模式（代理）的代理循环
/* eslint-disable no-console */
import {createToolHandlers} from '../agent/tool-handlers';
import {runAgent, isTrialAvailable} from '../agent/agent-loop';

export const maybeRunAgentTest = vm => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('agenttest')) return;
    const prompt = params.get('prompt') || 'ネコが旗をクリックしたら右に動き続けるようにして';
    const run = async () => {
        console.log('[agenttest] start (trial available:', isTrialAvailable(), ')');
        let deltaCount = 0;
        let firstDeltaAt = null;
        const startedAt = Date.now();
        try {
            await runAgent({
                apiKey: '',
                vm,
                userText: prompt,
                apiMessages: [],
                onAssistantStart: () => console.log('[agenttest] turn start at', Date.now() - startedAt, 'ms'),
                onAssistantDelta: delta => {
                    deltaCount++;
                    if (!firstDeltaAt) {
                        firstDeltaAt = Date.now() - startedAt;
                        console.log('[agenttest] first delta at', firstDeltaAt, 'ms:', JSON.stringify(delta));
                    }
                },
                onAssistantText: t => console.log('[agenttest] text:', t),
                onToolStart: s => console.log('[agenttest] tool start:', s),
                onToolEnd: ok => console.log('[agenttest] tool end:', ok),
                onToolDrafting: (label, chars) => {
                    // 每1000字符输出一次进度（防止日志洪水）
                    if (label && (chars === 0 || chars % 1000 < 30)) {
                        console.log('[agenttest] drafting:', label, chars);
                    }
                }
            });
            console.log('[agenttest] PASSED. deltas:', deltaCount, 'elapsed:', Date.now() - startedAt, 'ms');
        } catch (e) {
            console.error('[agenttest] FAILED:', e.message);
        }
    };
    setTimeout(run, 4000);
};

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export const maybeRunSelfTest = vm => {
    if (!new URLSearchParams(window.location.search).has('selftest')) return;
    const handlers = createToolHandlers(vm);

    const run = async () => {
        console.log('[selftest] start');
        try {
            // 库搜索
            const found = handlers.search_library({kind: 'sprite', query: 'ball'});
            console.log('[selftest] search:', found.results.map(r => r.name).join(', '));

            // 添加角色
            const added = await handlers.add_sprite({name: 'Ball'});
            console.log('[selftest] add_sprite:', JSON.stringify(added));

            // 给 Ball 添加脚本
            handlers.set_scripts({
                target: 'Ball',
                scripts: [
                    {blocks: [
                        {opcode: 'event_whenflagclicked'},
                        {opcode: 'control_forever', substack: [
                            {opcode: 'motion_glideto', inputs: {SECS: 1, TO: '_random_'}}
                        ]}
                    ]}
                ]
            });
            await delay(500);

            // 给猫(Sprite1)添加带变量的脚本
            handlers.set_scripts({
                target: 'Sprite1',
                scripts: [
                    {blocks: [
                        {opcode: 'event_whenflagclicked'},
                        {opcode: 'data_setvariableto', fields: {VARIABLE: 'スコア'}, inputs: {VALUE: 0}},
                        {opcode: 'control_forever', substack: [
                            {opcode: 'motion_movesteps', inputs: {STEPS: 10}},
                            {opcode: 'motion_ifonedgebounce'},
                            {opcode: 'control_if',
                                inputs: {CONDITION: {opcode: 'sensing_touchingobject',
                                    inputs: {TOUCHINGOBJECTMENU: 'Ball'}}},
                                substack: [
                                    {opcode: 'data_changevariableby', fields: {VARIABLE: 'スコア'}, inputs: {VALUE: 1}},
                                    {opcode: 'looks_sayforsecs', inputs: {MESSAGE: 'あたった!', SECS: 1}}
                                ]}
                        ]}
                    ]}
                ]
            });

            // 画笔区块（扩展自动加载确认）
            await handlers.set_scripts({
                target: 'Ball',
                scripts: [
                    {blocks: [
                        {opcode: 'event_whenthisspriteclicked'},
                        {opcode: 'pen_clear'},
                        {opcode: 'pen_penDown'},
                        {opcode: 'pen_stamp'}
                    ]}
                ]
            });
            console.log('[selftest] pen extension loaded:',
                vm.extensionManager.isExtensionLoaded('pen'));

            // 属性设置
            handlers.set_sprite_properties({target: 'Ball', x: 150, y: 100, size: 80});

            //状态获取（确认逆转换）
            const state = handlers.get_project_state();
            console.log('[selftest] project state:', JSON.stringify(state, null, 1));
            console.log('[selftest] PASSED');
        } catch (e) {
            console.error('[selftest] FAILED:', e);
        }
    };

    // 等待项目加载完成后再执行
    setTimeout(run, 4000);
};
