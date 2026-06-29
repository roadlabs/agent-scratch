// Runtime Actor 模式的 agent loop。
//
// 与 agent-loop.js 的关系：
//   - 镜像 runAgent 的结构（OpenAI 兼容 + Anthropic 双分支）
//   - 关键替换：
//     1) handlers ← createRuntimeToolHandlers(vm)（不是 createToolHandlers）
//     2) system ← getRuntimeActorSystemPrompt(lang)（单一提示，无 getBlockOperationPrompt）
//     3) tools ← RUNTIME_TOOLS（无 BLOCK_TOOL_NAMES 过滤——actor 工具永不包含 set_scripts）
//     4) summary/drafting ← summarizeActorToolCall / runtimeDraftingLabel
//   - 其他（provider dispatch、流式、30 iter 上限、错误处理、prompt caching）保持一致
//
// 后续重构 TODO：把 runAgent 与 runActorAgent 共享的内层（dispatch + 循环体）抽取到
// agent-loop-core.js。本提交按 Option B 复制实现，最小化 blast radius。

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import {
    getDeepSeekApiKey, isDeepSeekModel,
    getOpenAIApiKey, isOpenAIModel,
    getGeminiApiKey, isGeminiModel,
    TRIAL_MODEL, isTrialAvailable, getTrialToken, TRIAL_PROXY_URL,
    getModel, AuthError
} from './agent-loop';
import {ToolError} from './tool-handlers';
import {RUNTIME_TOOLS, runtimeDraftingLabel, summarizeActorToolCall} from './runtime-tools';
import {createRuntimeToolHandlers} from './runtime-handlers';
import {getRuntimeActorSystemPrompt} from './runtime-system-prompt';

const MAX_ITERATIONS = 30;
const MAX_TOKENS = 16000;
const REQUEST_TIMEOUT_MS = 180000;

// 在对话末尾重新附加 cache_control（移动式断点；与 agent-loop.js:63 同款）
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

const toOpenAITools = tools => tools.map(({name, description, input_schema}) => ({
    type: 'function',
    function: {name, description, parameters: input_schema}
}));

// Anthropic 格式 → OpenAI 格式（与 agent-loop.js:87 同款）
const anthropicToOpenAIMessages = messages => {
    const result = [];
    for (const msg of messages) {
        if (msg.role === 'user') {
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

// Google Gemini 不允许 x-stainless-* 头跨域（与 agent-loop.js:128 同款）
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
 * OpenAI 互換 (DeepSeek / OpenAI / Gemini) Actor 模式 エージェントループ
 */
const runOpenAICompatActorAgent = async ({
    apiKey: compatApiKey,
    baseURL,
    stripSdkHeaders,
    model: modelOverride,
    vm,
    userText,
    apiMessages,
    signal,
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
        maxRetries: 2,
        ...(stripSdkHeaders ? {defaultHeaders: STRIP_STAINLESS_HEADERS} : {})
    });
    const handlers = createRuntimeToolHandlers(vm);
    const oaiTools = toOpenAITools(RUNTIME_TOOLS);
    const systemMessages = [
        {role: 'system', content: getRuntimeActorSystemPrompt(lang)}
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
                ...(isOpenAI
                    ? {max_completion_tokens: MAX_TOKENS}
                    : {max_tokens: MAX_TOKENS}),
                messages: [...systemMessages, ...oaiMessages],
                tools: oaiTools,
                tool_choice: 'auto',
                stream: true
            }, {signal});

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
                                onToolDrafting(runtimeDraftingLabel(tc.function.name, lang), 0);
                            }
                        }
                        const p = partialToolCalls[tc.index];
                        if (tc.id) p.id += tc.id;
                        if (tc.function?.name) p.function.name += tc.function.name;
                        if (tc.function?.arguments) {
                            p.function.arguments += tc.function.arguments;
                            if (onToolDrafting) {
                                onToolDrafting(runtimeDraftingLabel(p.function.name, lang), p.function.arguments.length);
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

        const assistantContent = [];
        if (assistantText) assistantContent.push({type: 'text', text: assistantText});
        for (const tc of toolCalls) {
            let input = {};
            try { input = JSON.parse(tc.function.arguments); } catch { /* ignore */ }
            assistantContent.push({type: 'tool_use', id: tc.id, name: tc.function.name, input});
        }
        apiMessages.push({role: 'assistant', content: assistantContent});

        if (toolCalls.length === 0) return;

        const toolResults = [];
        for (const tc of toolCalls) {
            if (signal && signal.aborted) return;
            let input = {};
            try { input = JSON.parse(tc.function.arguments); } catch { /* ignore */ }
            onToolStart(summarizeActorToolCall(tc.function.name, input, lang));
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
 * Actor 模式 エージェントループ。
 * apiMessages は呼び出し側が保持する会話履歴(Anthropic形式)で、in-place に更新される。
 */
export const runActorAgent = async ({
    apiKey,
    vm,
    userText,
    apiMessages,
    signal,
    lang = 'ja',
    onAssistantStart,
    onAssistantDelta,
    onAssistantText,
    onToolStart,
    onToolEnd,
    onToolDrafting
}) => {
    const model = getModel();

    // 试用模式：经由 DeepSeek 代理
    const useTrial = !apiKey && !getDeepSeekApiKey() && !getOpenAIApiKey() && !getGeminiApiKey() && isTrialAvailable();
    if (useTrial) {
        return runOpenAICompatActorAgent({
            apiKey: getTrialToken(),
            baseURL: TRIAL_PROXY_URL,
            model: TRIAL_MODEL,
            vm, userText, apiMessages, signal, lang,
            onAssistantStart, onAssistantDelta, onAssistantText,
            onToolStart, onToolEnd, onToolDrafting
        });
    }

    if (isDeepSeekModel(model)) {
        const deepseekApiKey = getDeepSeekApiKey();
        if (!deepseekApiKey) throw new AuthError(lang === 'zh' ? '未设置 DeepSeek API 密钥。请从 ⚙️ 进行设置。' : lang === 'en' ? 'No DeepSeek API key is set. Please set it from ⚙️.' : 'DeepSeek APIキーが設定されていません。⚙️ から設定してください。');
        return runOpenAICompatActorAgent({
            apiKey: deepseekApiKey, vm, userText, apiMessages, signal, lang,
            onAssistantStart, onAssistantDelta, onAssistantText,
            onToolStart, onToolEnd, onToolDrafting
        });
    }

    if (isOpenAIModel(model)) {
        const openaiApiKey = getOpenAIApiKey();
        if (!openaiApiKey) throw new AuthError(lang === 'zh' ? '未设置 OpenAI API 密钥。请从 ⚙️ 进行设置。' : lang === 'en' ? 'No OpenAI API key is set. Please set it from ⚙️.' : 'OpenAI APIキーが設定されていません。⚙️ から設定してください。');
        return runOpenAICompatActorAgent({
            apiKey: openaiApiKey,
            baseURL: 'https://api.openai.com/v1',
            vm, userText, apiMessages, signal, lang,
            onAssistantStart, onAssistantDelta, onAssistantText,
            onToolStart, onToolEnd, onToolDrafting
        });
    }

    if (isGeminiModel(model)) {
        const geminiApiKey = getGeminiApiKey();
        if (!geminiApiKey) throw new AuthError(lang === 'zh' ? '未设置 Gemini API 密钥。请从 ⚙️ 进行设置。' : lang === 'en' ? 'No Gemini API key is set. Please set it from ⚙️.' : 'Gemini APIキーが設定されていません。⚙️ から設定してください。');
        return runOpenAICompatActorAgent({
            apiKey: geminiApiKey,
            baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
            stripSdkHeaders: true,
            vm, userText, apiMessages, signal, lang,
            onAssistantStart, onAssistantDelta, onAssistantText,
            onToolStart, onToolEnd, onToolDrafting
        });
    }

    // Anthropic
    const effectiveModel = model;
    const client = new Anthropic({
        apiKey,
        dangerouslyAllowBrowser: true,
        defaultHeaders: {'anthropic-dangerous-direct-browser-access': 'true'},
        timeout: REQUEST_TIMEOUT_MS,
        maxRetries: 1
    });
    const handlers = createRuntimeToolHandlers(vm);

    // system + tools 都是固定的 → prompt caching
    const system = [
        {type: 'text', text: getRuntimeActorSystemPrompt(lang), cache_control: {type: 'ephemeral'}}
    ];
    const tools = RUNTIME_TOOLS.map((tool, i) =>
        (i === RUNTIME_TOOLS.length - 1 ? {...tool, cache_control: {type: 'ephemeral'}} : tool)
    );

    apiMessages.push({role: 'user', content: [{type: 'text', text: userText}]});

    let useThinking = true;
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
        if (signal && signal.aborted) return;
        moveCacheMarker(apiMessages);

        let response;
        try {
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
            if (onToolDrafting) {
                let draftLabel = null;
                let draftChars = 0;
                stream.on('streamEvent', event => {
                    if (event.type === 'content_block_start' &&
                        event.content_block.type === 'tool_use') {
                        draftLabel = runtimeDraftingLabel(event.content_block.name, lang);
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
                return;
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

        const toolResults = [];
        for (const block of response.content) {
            if (block.type !== 'tool_use') continue;
            if (signal && signal.aborted) return;
            onToolStart(summarizeActorToolCall(block.name, block.input, lang));
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