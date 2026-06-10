// Anthropic Messages API 的手动 tool use 循环
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import {TOOLS, BLOCK_TOOL_NAMES, summarizeToolCall, draftingLabel} from './tools';
import {getSystemPrompt, getBlockOperationPrompt} from './system-prompt';
import {createToolHandlers, ToolError} from './tool-handlers';

export class AuthError extends Error {}

// 试用模式：未输入密钥时使用的代理 URL（构建时注入。空则无效）
const TRIAL_PROXY_URL = process.env.TRIAL_PROXY_URL;

const TRIAL_TOKEN_KEY = 'agent-scratch-trial-token';

// 从 URL 参数 ?p=xxx 读取令牌并保存到 localStorage（启动时调用）
export const initTrialToken = () => {
    const params = new URLSearchParams(window.location.search);
    const p = params.get('p');
    if (p) {
        localStorage.setItem(TRIAL_TOKEN_KEY, p);
        // 从 URL 中移除参数（以便刷新后不再残留）
        params.delete('p');
        const newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '') + window.location.hash;
        window.history.replaceState({}, '', newUrl);
    }
};

export const getTrialToken = () => localStorage.getItem(TRIAL_TOKEN_KEY) || '';

// 仅在 TRIAL_PROXY_URL 已设置且令牌已保存时启用试用模式
export const isTrialAvailable = () => Boolean(TRIAL_PROXY_URL && getTrialToken());

const MODEL_STORAGE_KEY = 'agent-scratch-model';
const DEEPSEEK_API_KEY_STORAGE_KEY = 'agent-scratch-deepseek-api-key';
const OPENAI_API_KEY_STORAGE_KEY = 'agent-scratch-openai-api-key';
const GEMINI_API_KEY_STORAGE_KEY = 'agent-scratch-gemini-api-key';

// 本地开发用密钥（从 .env 经 webpack DefinePlugin 注入。未设置则为空字符串）
export const DEV_ANTHROPIC_KEY = process.env.DEV_ANTHROPIC_API_KEY || '';
const DEV_DEEPSEEK_KEY = process.env.DEV_DEEPSEEK_API_KEY || '';
const DEV_OPENAI_KEY = process.env.DEV_OPENAI_API_KEY || '';
const DEV_GEMINI_KEY = process.env.DEV_GEMINI_API_KEY || '';

export const DEFAULT_MODEL = 'deepseek-chat'; // 默认模型
export const TRIAL_MODEL = 'deepseek-chat';   // 试用模式使用的模型
export const getModel = () => localStorage.getItem(MODEL_STORAGE_KEY) || DEFAULT_MODEL;
export const setModel = model => localStorage.setItem(MODEL_STORAGE_KEY, model);
export const getDeepSeekApiKey = () => localStorage.getItem(DEEPSEEK_API_KEY_STORAGE_KEY) || DEV_DEEPSEEK_KEY;
export const setDeepSeekApiKey = key => localStorage.setItem(DEEPSEEK_API_KEY_STORAGE_KEY, key);
export const isDeepSeekModel = model => model && model.startsWith('deepseek-');
export const getOpenAIApiKey = () => localStorage.getItem(OPENAI_API_KEY_STORAGE_KEY) || DEV_OPENAI_KEY;
export const setOpenAIApiKey = key => localStorage.setItem(OPENAI_API_KEY_STORAGE_KEY, key);
export const isOpenAIModel = model => model && model.startsWith('gpt-');
export const getGeminiApiKey = () => localStorage.getItem(GEMINI_API_KEY_STORAGE_KEY) || DEV_GEMINI_KEY;
export const setGeminiApiKey = key => localStorage.setItem(GEMINI_API_KEY_STORAGE_KEY, key);
export const isGeminiModel = model => model && model.startsWith('gemini-');

const MAX_ITERATIONS = 30;
const MAX_TOKENS = 16000;
const REQUEST_TIMEOUT_MS = 180000; // 单次 API 调用的上限（因为是流式传输，通常不会触发的保险）

// 在对话末尾重新附加 cache_control（移动式断点）
const moveCacheMarker = messages => {
    for (const message of messages) {
        if (!Array.isArray(message.content)) continue;
        for (const block of message.content) {
            if (block.cache_control) delete block.cache_control;
        }
    }
    const last = messages[messages.length - 1];
    if (last && Array.isArray(last.content) && last.content.length > 0) {
        const lastBlock = last.content[last.content.length - 1];
        if (['text', 'tool_result', 'tool_use'].includes(lastBlock.type)) {
            lastBlock.cache_control = {type: 'ephemeral'};
        }
    }
};

// Anthropic 格式的工具定义 → 转换为 OpenAI 格式
const toOpenAITools = tools => tools.map(({name, description, input_schema}) => ({
    type: 'function',
    function: {name, description, parameters: input_schema}
}));

// 将 OpenAI 格式的对话历史添加到 Anthropic 的 apiMessages 的适配器
// 此处另行管理 OpenAI 格式的消息数组
const anthropicToOpenAIMessages = messages => {
    const result = [];
    for (const msg of messages) {
        if (msg.role === 'user') {
            // 包含 tool_result 时 → 转换为 tool 消息群
            const toolResults = Array.isArray(msg.content)
                ? msg.content.filter(b => b.type === 'tool_result')
                : [];
            const textBlocks = Array.isArray(msg.content)
                ? msg.content.filter(b => b.type === 'text')
                : [];
            for (const tr of toolResults) {
                result.push({role: 'tool', tool_call_id: tr.tool_use_id, content: tr.content});
            }
            if (textBlocks.length > 0) {
                result.push({role: 'user', content: textBlocks.map(b => b.text).join('\n')});
            }
        } else if (msg.role === 'assistant') {
            const textBlocks = Array.isArray(msg.content)
                ? msg.content.filter(b => b.type === 'text')
                : [];
            const toolUses = Array.isArray(msg.content)
                ? msg.content.filter(b => b.type === 'tool_use')
                : [];
            const text = textBlocks.map(b => b.text).join('\n') || null;
            const tool_calls = toolUses.length > 0
                ? toolUses.map(b => ({
                    id: b.id,
                    type: 'function',
                    function: {name: b.name, arguments: JSON.stringify(b.input)}
                }))
                : undefined;
            result.push({role: 'assistant', content: text, ...(tool_calls ? {tool_calls} : {})});
        }
    }
    return result;
};

// 指定去除 OpenAI SDK 自动附加的 x-stainless-* 头。
// Google 的 OpenAI 兼容端点不允许这些头 CORS 跨域，
// 如果有这些头，预检请求会返回 403 并导致"Connection error."失败
const STRIP_STAINLESS_HEADERS = {
    'x-stainless-arch': null,
    'x-stainless-lang': null,
    'x-stainless-os': null,
    'x-stainless-package-version': null,
    'x-stainless-retry-count': null,
    'x-stainless-runtime': null,
    'x-stainless-runtime-version': null,
    'x-stainless-timeout': null,
    'x-stainless-helper-method': null
};

/**
 * OpenAI互換 (DeepSeek / OpenAI / Gemini 共用) エージェントループ
 */
const runOpenAICompatAgent = async ({
    apiKey: compatApiKey,
    baseURL,
    stripSdkHeaders,
    model: modelOverride,
    vm,
    userText,
    apiMessages,
    signal,
    blocksEnabled,
    lang = 'ja',
    onAssistantStart,
    onAssistantDelta,
    onAssistantText,
    onToolStart,
    onToolEnd,
    onToolDrafting
}) => {
    const model = modelOverride || getModel();
    const isOpenAI = isOpenAIModel(model);
    const client = new OpenAI({
        apiKey: compatApiKey,
        baseURL: baseURL || 'https://api.deepseek.com',
        dangerouslyAllowBrowser: true,
        timeout: REQUEST_TIMEOUT_MS,
        maxRetries: 2, // 为了承受 503 等临时错误（指数退避自动重试）
        ...(stripSdkHeaders ? {defaultHeaders: STRIP_STAINLESS_HEADERS} : {})
    });
    const handlers = createToolHandlers(vm, {blocksEnabled});
    const activeTools = blocksEnabled ? TOOLS : TOOLS.filter(t => !BLOCK_TOOL_NAMES.has(t.name));
    const oaiTools = toOpenAITools(activeTools);
    const systemMessages = [
        {role: 'system', content: getSystemPrompt(lang)},
        {role: 'system', content: getBlockOperationPrompt(blocksEnabled, lang)}
    ];

    apiMessages.push({role: 'user', content: [{type: 'text', text: userText}]});

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
        if (signal && signal.aborted) return;

        const oaiMessages = anthropicToOpenAIMessages(apiMessages);

        let assistantText = '';
        let toolCalls = [];

        try {
            if (onAssistantStart) onAssistantStart();
            const stream = await client.chat.completions.create({
                model,
                // GPT-5 系列不支持 max_tokens（需使用 max_completion_tokens）。
                // 流式传输时的 usage 获取也需要 OpenAI 明确 opt-in
                ...(isOpenAI
                    ? {max_completion_tokens: MAX_TOKENS}
                    : {max_tokens: MAX_TOKENS}),
                messages: [...systemMessages, ...oaiMessages],
                tools: oaiTools,
                tool_choice: 'auto',
                stream: true
            }, {signal});

            // 通过流式传输收集文本和 tool_calls
            const partialToolCalls = {};
            for await (const chunk of stream) {
                if (signal && signal.aborted) return;
                const delta = chunk.choices[0]?.delta;
                if (!delta) continue;

                if (delta.content) {
                    assistantText += delta.content;
                    if (onAssistantDelta) onAssistantDelta(delta.content);
                }
                if (delta.tool_calls) {
                    for (const tc of delta.tool_calls) {
                        if (!partialToolCalls[tc.index]) {
                            partialToolCalls[tc.index] = {id: '', type: 'function', function: {name: '', arguments: ''}};
                            if (onToolDrafting && tc.function?.name) {
                                onToolDrafting(draftingLabel(tc.function.name, lang), 0);
                            }
                        }
                        const p = partialToolCalls[tc.index];
                        if (tc.id) p.id += tc.id;
                        if (tc.function?.name) p.function.name += tc.function.name;
                        if (tc.function?.arguments) {
                            p.function.arguments += tc.function.arguments;
                            if (onToolDrafting) {
                                onToolDrafting(draftingLabel(p.function.name, lang), p.function.arguments.length);
                            }
                        }
                    }
                }
                if (chunk.choices[0]?.finish_reason && onToolDrafting) {
                    onToolDrafting(null, 0);
                }

            }
            toolCalls = Object.values(partialToolCalls);
        } catch (e) {
            if (e?.status === 401 || e?.code === 'invalid_api_key') throw new AuthError(e.message);
            if (e?.status === 429) {
                throw new Error(lang === 'zh' ?
                    '服务繁忙，请稍后再试。' :
                    lang === 'en' ?
                    'The service is busy. Please wait a moment and try again.' :
                    '混み合っています。少し待ってからもう一度試してください。');
            }
            if (e?.status >= 500) {
                // Gemini 等频繁发生的一时性服务器过载（503 等）
                throw new Error(lang === 'zh' ?
                    `AI 服务器繁忙或暂时不可用 (${e.status})。请稍后再发送相同内容。` :
                    lang === 'en' ?
                    `The AI server is busy or temporarily unavailable (${e.status}). ` +
                    'Please wait a moment and send the same message again.' :
                    `AIサーバが混み合っているか一時的に不調です(${e.status})。` +
                    '少し待ってから、同じ内容をもう一度送ってください。');
            }
            if (e?.name === 'AbortError' || e?.name === 'APIUserAbortError') return;
            throw e;
        }

        // 将 assistant 的响应追加到 apiMessages（以 Anthropic 格式统一管理）
        const assistantContent = [];
        if (assistantText) assistantContent.push({type: 'text', text: assistantText});
        for (const tc of toolCalls) {
            let input = {};
            try { input = JSON.parse(tc.function.arguments); } catch { /* ignore */ }
            assistantContent.push({type: 'tool_use', id: tc.id, name: tc.function.name, input});
        }
        apiMessages.push({role: 'assistant', content: assistantContent});

        if (toolCalls.length === 0) return;

        // ツール実行
        const toolResults = [];
        for (const tc of toolCalls) {
            if (signal && signal.aborted) return;
            let input = {};
            try { input = JSON.parse(tc.function.arguments); } catch { /* ignore */ }
            onToolStart(summarizeToolCall(tc.function.name, input, lang));
            let result;
            let isError = false;
            try {
                const handler = handlers[tc.function.name];
                if (!handler) throw new ToolError(`未知のツール: ${tc.function.name}`);
                result = await handler(input);
            } catch (e) {
                isError = true;
                result = {error: e.message};
                if (!(e instanceof ToolError)) {
                    console.error(`tool ${tc.function.name} failed:`, e); // eslint-disable-line no-console
                }
            }
            onToolEnd(!isError, isError ? String(result.error) : undefined);
            toolResults.push({
                type: 'tool_result',
                tool_use_id: tc.id,
                content: JSON.stringify(result),
                ...(isError ? {is_error: true} : {})
            });
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        apiMessages.push({role: 'user', content: toolResults});
    }

    onAssistantText(lang === 'zh' ?
        '(已到达工具执行次数上限而停止。如果需要继续，请指示。)' :
        lang === 'en' ?
        '(Stopped because the tool execution limit was reached. Please instruct me to continue if needed.)' :
        '(ツール実行回数の上限に達したため停止しました。続きが必要なら指示してください)');
};

/**
 * エージェントループを実行する。
 * apiMessages は呼び出し側が保持する会話履歴(Anthropic形式)で、in-place に更新される。
 */
export const runAgent = async ({
    apiKey,
    vm,
    userText,
    apiMessages,
    signal,
    blocksEnabled = true,
    lang = 'ja',
    onAssistantStart,
    onAssistantDelta,
    onAssistantText,
    onToolStart,
    onToolEnd,
    onToolDrafting
}) => {
    const model = getModel();

    // 试用模式：未输入密钥 + 代理 URL 已设置 + 令牌已保存 → 经由 DeepSeek 代理
    const useTrial = !apiKey && !getDeepSeekApiKey() && !getOpenAIApiKey() && !getGeminiApiKey() && isTrialAvailable();
    if (useTrial) {
        return runOpenAICompatAgent({
            apiKey: getTrialToken(),
            baseURL: TRIAL_PROXY_URL,
            model: TRIAL_MODEL,
            // 试用模式不允许区块操作（固定为说明・讲解模式）
            vm, userText, apiMessages, signal, blocksEnabled: false, lang,
            onAssistantStart, onAssistantDelta, onAssistantText,
            onToolStart, onToolEnd, onToolDrafting
        });
    }

    // 选择了 DeepSeek 模型时，使用 OpenAI 兼容循环
    if (isDeepSeekModel(model)) {
        const deepseekApiKey = getDeepSeekApiKey();
        if (!deepseekApiKey) throw new AuthError(lang === 'zh' ? '未设置 DeepSeek API 密钥。请从 ⚙️ 进行设置。' : lang === 'en' ? 'No DeepSeek API key is set. Please set it from ⚙️.' : 'DeepSeek APIキーが設定されていません。⚙️ から設定してください。');
        return runOpenAICompatAgent({
            apiKey: deepseekApiKey, vm, userText, apiMessages, signal, blocksEnabled, lang,
            onAssistantStart, onAssistantDelta, onAssistantText,
            onToolStart, onToolEnd, onToolDrafting
        });
    }

    // 选择了 OpenAI (GPT) 模型时，也使用 OpenAI 兼容循环
    if (isOpenAIModel(model)) {
        const openaiApiKey = getOpenAIApiKey();
        if (!openaiApiKey) throw new AuthError(lang === 'zh' ? '未设置 OpenAI API 密钥。请从 ⚙️ 进行设置。' : lang === 'en' ? 'No OpenAI API key is set. Please set it from ⚙️.' : 'OpenAI APIキーが設定されていません。⚙️ から設定してください。');
        return runOpenAICompatAgent({
            apiKey: openaiApiKey,
            baseURL: 'https://api.openai.com/v1',
            vm, userText, apiMessages, signal, blocksEnabled, lang,
            onAssistantStart, onAssistantDelta, onAssistantText,
            onToolStart, onToolEnd, onToolDrafting
        });
    }

    // Google Gemini 模型也通过 OpenAI 兼容端点使用同一循环
    if (isGeminiModel(model)) {
        const geminiApiKey = getGeminiApiKey();
        if (!geminiApiKey) throw new AuthError(lang === 'zh' ? '未设置 Gemini API 密钥。请从 ⚙️ 进行设置。' : lang === 'en' ? 'No Gemini API key is set. Please set it from ⚙️.' : 'Gemini APIキーが設定されていません。⚙️ から設定してください。');
        return runOpenAICompatAgent({
            apiKey: geminiApiKey,
            baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
            stripSdkHeaders: true,
            vm, userText, apiMessages, signal, blocksEnabled, lang,
            onAssistantStart, onAssistantDelta, onAssistantText,
            onToolStart, onToolEnd, onToolDrafting
        });
    }

    // Anthropic 模型
    const effectiveModel = model;
    const client = new Anthropic({
        apiKey,
        dangerouslyAllowBrowser: true,
        defaultHeaders: {'anthropic-dangerous-direct-browser-access': 'true'},
        timeout: REQUEST_TIMEOUT_MS,
        maxRetries: 1
    });
    const handlers = createToolHandlers(vm, {blocksEnabled});

    // 系统提示词和工具定义是固定的 → prompt caching
    const system = [
        {type: 'text', text: getSystemPrompt(lang), cache_control: {type: 'ephemeral'}},
        {type: 'text', text: getBlockOperationPrompt(blocksEnabled, lang)}
    ];
    const activeTools = blocksEnabled ? TOOLS : TOOLS.filter(t => !BLOCK_TOOL_NAMES.has(t.name));
    const tools = activeTools.map((tool, i) =>
        (i === activeTools.length - 1 ? {...tool, cache_control: {type: 'ephemeral'}} : tool)
    );

    apiMessages.push({role: 'user', content: [{type: 'text', text: userText}]});

    let useThinking = true;
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
        if (signal && signal.aborted) return;
        moveCacheMarker(apiMessages);

        let response;
        try {
            // 通过流式传输调用，将 text 的增量实时反映到 UI
            if (onAssistantStart) onAssistantStart();
            const stream = client.messages.stream({
                model: effectiveModel,
                max_tokens: MAX_TOKENS,
                system,
                tools,
                messages: apiMessages,
                ...(useThinking ? {thinking: {type: 'adaptive'}} : {})
            }, {signal});
            if (onAssistantDelta) {
                stream.on('text', delta => onAssistantDelta(delta));
            }
            // 因为工具输入(JSON)生成期间正文文本不会流动，
            // 将「正在编写○○...(n字符)」的进度发送给 UI
            if (onToolDrafting) {
                let draftLabel = null;
                let draftChars = 0;
                stream.on('streamEvent', event => {
                    if (event.type === 'content_block_start' &&
                        event.content_block.type === 'tool_use') {
                        draftLabel = draftingLabel(event.content_block.name, lang);
                        draftChars = 0;
                        onToolDrafting(draftLabel, 0);
                    } else if (event.type === 'content_block_delta' &&
                        event.delta.type === 'input_json_delta' && draftLabel) {
                        draftChars += event.delta.partial_json.length;
                        onToolDrafting(draftLabel, draftChars);
                    } else if (event.type === 'content_block_stop' && draftLabel) {
                        draftLabel = null;
                        onToolDrafting(null, 0);
                    }
                });
            }
            // 获取完整的 Message（含 thinking/tool_use 区块）
            response = await stream.finalMessage();
        } catch (e) {
            if (e instanceof Anthropic.AuthenticationError) {
                throw new AuthError(e.message);
            }
            if (e instanceof Anthropic.RateLimitError) {
                throw new Error(lang === 'zh' ?
                    '服务繁忙，请稍后再试。' :
                    lang === 'en' ?
                    'The service is busy. Please wait a moment and try again.' :
                    '混み合っています。少し待ってからもう一度試してください。');
            }
            if (e instanceof Anthropic.InternalServerError) {
                throw new Error(lang === 'zh' ?
                    `AI 服务器繁忙或暂时不可用 (${e.status})。请稍后再发送相同内容。` :
                    lang === 'en' ?
                    `The AI server is busy or temporarily unavailable (${e.status}). ` +
                    'Please wait a moment and send the same message again.' :
                    `AIサーバーが混み合っているか一瞬的に不通です(${e.status})。` +
                    '少し待ってから、同じ内容をもう一度送ってください。');
            }
            // adaptive thinking 未支持模型的降级处理
            if (useThinking && e instanceof Anthropic.BadRequestError &&
                String(e.message).includes('thinking')) {
                useThinking = false;
                iteration--;
                continue;
            }
            if (e instanceof Anthropic.BadRequestError &&
                String(e.message).includes('model not allowed')) {
                throw new Error(lang === 'zh' ?
                    '此模型在试用模式下不可用。请从 ⚙️ 设置自己的 API 密钥。' :
                    lang === 'en' ?
                    'This model is not available in trial mode. Please set your own API key from ⚙️.' :
                    'お試しモードでは使えないモデルです。⚙️ から自分のAPIキーを設定してください。');
            }
            if (e instanceof Anthropic.APIConnectionTimeoutError) {
                throw new Error(lang === 'zh' ?
                    '耗时过长已取消。请将任务分解成更小的步骤（例如："先只创建球和球拍"）。' :
                    lang === 'en' ?
                    'It took too long, so it was canceled. Try breaking the task into smaller steps (e.g. "First make just the ball and paddle").' :
                    '時間がかかりすぎたため中断しました。タスクを小さく分けて指示してみてください(例:「まずボールとパドルだけ作って」)。');
            }
            if (e instanceof Anthropic.APIUserAbortError) {
                return; // 用户主动停止
            }
            if (e instanceof Anthropic.APIConnectionError) {
                throw new Error(lang === 'zh' ?
                    '无法连接到 Anthropic API。请检查网络。' :
                    lang === 'en' ?
                    'Could not connect to the Anthropic API. Please check your network.' :
                    'Anthropic API に接続できませんでした。ネットワークを確認してください。');
            }
            throw e;
        }

        apiMessages.push({role: 'assistant', content: response.content});


        if (response.stop_reason !== 'tool_use') {
            if (response.stop_reason === 'max_tokens') {
                onAssistantText(lang === 'zh' ?
                    '(输出过长被截断。如果需要继续，请指示。)' :
                    lang === 'en' ?
                    '(The output was too long and got cut off. Please ask me to continue.)' :
                    '(出力が長すぎて途中で切れました。続きを指示してください)');
            }
            return;
        }

        // 工具执行
        const toolResults = [];
        for (const block of response.content) {
            if (block.type !== 'tool_use') continue;
            if (signal && signal.aborted) return;
            onToolStart(summarizeToolCall(block.name, block.input, lang));
            let result;
            let isError = false;
            try {
                const handler = handlers[block.name];
                if (!handler) throw new ToolError(`未知のツール: ${block.name}`);
                result = await handler(block.input);
            } catch (e) {
                isError = true;
                result = {error: e.message};
                if (!(e instanceof ToolError)) {
                    // 预期外的异常也输出到控制台
                    console.error(`tool ${block.name} failed:`, e); // eslint-disable-line no-console
                }
            }
            onToolEnd(!isError, isError ? String(result.error) : undefined);
            toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: JSON.stringify(result),
                ...(isError ? {is_error: true} : {})
            });
            // 为了展示区块逐渐组装的样子而稍作停顿
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        apiMessages.push({role: 'user', content: toolResults});
    }

    onAssistantText(lang === 'zh' ?
        '(已到达工具执行次数上限而停止。如果需要继续，请指示。)' :
        lang === 'en' ?
        '(Stopped because the tool execution limit was reached. Please instruct me to continue if needed.)' :
        '(ツール実行回数の上限に達したため停止しました。続きが必要なら指示してください)');
};
