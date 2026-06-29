import React, {useCallback, useEffect, useRef, useState} from 'react';
import ChatPanelComponent from '../components/chat-panel/chat-panel.jsx';
import ApiKeyModal from '../components/api-key-modal/api-key-modal.jsx';
import DisclosureModal from '../components/disclosure-modal/disclosure-modal.jsx';
import {runAgent, AuthError, getModel, setModel, isTrialAvailable, getDeepSeekApiKey, setDeepSeekApiKey, isDeepSeekModel, getOpenAIApiKey, setOpenAIApiKey, isOpenAIModel, getGeminiApiKey, setGeminiApiKey, isGeminiModel, DEV_ANTHROPIC_KEY} from '../agent/agent-loop';
import {STRINGS, errorPrefix} from '../i18n';

const STORAGE_KEY = 'vibecat-api-key';
const DISCLOSURE_STORAGE_KEY = 'vibecat-disclosure-accepted';
const MODE_STORAGE_KEY = 'vibecat-mode';

const ChatPanel = ({vm, lang = 'ja', collapsed, onToggleCollapse, projectKey}) => {
    const t = STRINGS[lang];
    const [messages, setMessages] = useState([]);
    const [running, setRunning] = useState(false);
    const [apiKey, setApiKey] = useState(() => localStorage.getItem(STORAGE_KEY) || DEV_ANTHROPIC_KEY || '');
    const [deepseekApiKey, setDeepseekApiKeyState] = useState(() => getDeepSeekApiKey());
    const [openaiApiKey, setOpenaiApiKeyState] = useState(() => getOpenAIApiKey());
    const [geminiApiKey, setGeminiApiKeyState] = useState(() => getGeminiApiKey());
    const [blocksEnabled, setBlocksEnabled] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [showDisclosure, setShowDisclosure] = useState(
        () => !localStorage.getItem(DISCLOSURE_STORAGE_KEY)
    );
    // 工具输入生成中的进度显示("正在编写区块 (1200字符)" 等)
    const [drafting, setDrafting] = useState(null);
    const [currentModel, setCurrentModel] = useState(() => getModel());
    // Agent 模式：'programmer' (set_scripts DSL) 或 'actor' (runtime primitives)
    const [mode, setMode] = useState(() => {
        const stored = localStorage.getItem(MODE_STORAGE_KEY);
        return stored === 'actor' ? 'actor' : 'programmer';
    });

    // Anthropic API 格式的对话历史（支持多轮）
    const apiMessagesRef = useRef([]);
    // 用于检测模式切换：切换时往 apiMessages 注入一行 user 提示，避免 LLM 沿用旧模式思路
    const prevModeRef = useRef(mode);

    // 项目切换时清空聊天历史
    useEffect(() => {
        if (projectKey > 0) {
            setMessages([]);
            apiMessagesRef.current = [];
        }
    }, [projectKey]);
    const abortRef = useRef(null);

    const appendMessage = useCallback(m => {
        setMessages(prev => [...prev, m]);
    }, []);

    // 流式传输：下一个 delta 开始新 assistant 行的信号
    const pendingNewAssistant = useRef(false);
    const startAssistant = useCallback(() => {
        pendingNewAssistant.current = true;
    }, []);

    // 将 text 的增量追加到末尾的 streaming 行（没有则新建）
    const appendAssistantDelta = useCallback(delta => {
        setMessages(prev => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (pendingNewAssistant.current || !last || last.role !== 'assistant' || !last.streaming) {
                pendingNewAssistant.current = false;
                next.push({role: 'assistant', text: delta, streaming: true});
            } else {
                next[next.length - 1] = {...last, text: last.text + delta};
            }
            return next;
        });
    }, []);

    // 执行结束时关闭 streaming 标志（用于判断"思考中..."显示）
    const finishStreaming = useCallback(() => {
        setMessages(prev => prev.map(m => (m.streaming ? {...m, streaming: false} : m)));
    }, []);

    // 将最近执行中的工具显示更新为 done/error（错误时保留详情）
    const finishLastTool = useCallback((ok, detail) => {
        setMessages(prev => {
            const next = [...prev];
            for (let i = next.length - 1; i >= 0; i--) {
                if (next[i].role === 'tool' && next[i].status === 'running') {
                    next[i] = {
                        ...next[i],
                        status: ok ? 'done' : 'error',
                        ...(detail ? {detail} : {})
                    };
                    break;
                }
            }
            return next;
        });
    }, []);

    const handleSend = useCallback(async (text, opts = {}) => {
        if (!vm) {
            appendMessage({role: 'error', text: t.vmNotReady});
            return;
        }
        //正常发送时显式传递子组件显示的值。如需通过建议等临时
        // 禁用的场合，优先使用 forceBlocksDisabled。
        // actor 模式下强制 blocksEnabled=false（防御性：actor 工具列表里没有 set_scripts，
        // 但确保三重防御中的一环在 UI 层就生效）。
        const effectiveBlocksEnabled = opts.forceBlocksDisabled ?
            false :
            mode === 'actor' ? false :
            (typeof opts.blocksEnabled === 'boolean' ? opts.blocksEnabled : blocksEnabled);
        appendMessage({role: 'user', text});
        setRunning(true);
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            await runAgent({
                apiKey,
                vm,
                userText: text,
                apiMessages: apiMessagesRef.current,
                signal: controller.signal,
                blocksEnabled: effectiveBlocksEnabled,
                lang,
                mode,
                onAssistantStart: startAssistant,
                onAssistantDelta: appendAssistantDelta,
                onAssistantText: t => appendMessage({role: 'assistant', text: t}),
                onToolStart: summary => {
                    setDrafting(null);
                    appendMessage({role: 'tool', text: summary, status: 'running'});
                },
                onToolEnd: (ok, detail) => finishLastTool(ok, detail),
                onToolDrafting: (label, chars) => {
                    setDrafting(label ? {label, chars} : null);
                }
            });
        } catch (e) {
            if (e instanceof AuthError) {
                appendMessage({role: 'error', text: t.authInvalid});
                setShowModal(true);
            } else if (e.name === 'AbortError' || controller.signal.aborted) {
                appendMessage({role: 'assistant', text: t.stopped});
            } else {
                appendMessage({role: 'error', text: errorPrefix(lang, e.message)});
            }
        } finally {
            setRunning(false);
            setDrafting(null);
            finishStreaming();
            abortRef.current = null;
        }
    }, [vm, apiKey, blocksEnabled, mode, lang, t, appendMessage, finishLastTool, startAssistant, appendAssistantDelta, finishStreaming]);

    // 切换 agent 模式：持久化到 localStorage，切换瞬间向 apiMessages 注入一行系统提醒
    const handleSetMode = useCallback(newMode => {
        if (newMode === mode) return;
        if (apiMessagesRef.current && apiMessagesRef.current.length > 0) {
            const noteKey = newMode === 'actor' ? 'modeSwitchToActor' : 'modeSwitchToProgrammer';
            const noteText = STRINGS[lang][noteKey] || (
                newMode === 'actor' ?
                    '(Switched to Actor mode)' :
                    '(Switched back to Programmer mode)'
            );
            apiMessagesRef.current.push({
                role: 'user',
                content: [{type: 'text', text: noteText}]
            });
        }
        prevModeRef.current = newMode;
        setMode(newMode);
        localStorage.setItem(MODE_STORAGE_KEY, newMode);
        // actor 模式下 blocksEnabled 不再有意义（actor 工具列表里没有 set_scripts），
        // 但保持与 ui 显示一致（trialModeNow 仍控制 toggle 显示）
    }, [mode, lang]);

    const handleStop = useCallback(() => {
        if (abortRef.current) abortRef.current.abort();
    }, []);

    const handleSaveApiKey = useCallback((key, model, dsKey, oaKey, gemKey) => {
        localStorage.setItem(STORAGE_KEY, key);
        setApiKey(key);
        if (model) { setModel(model); setCurrentModel(model); }
        if (dsKey !== undefined) {
            setDeepSeekApiKey(dsKey);
            setDeepseekApiKeyState(dsKey);
        }
        if (oaKey !== undefined) {
            setOpenAIApiKey(oaKey);
            setOpenaiApiKeyState(oaKey);
        }
        if (gemKey !== undefined) {
            setGeminiApiKey(gemKey);
            setGeminiApiKeyState(gemKey);
        }
        setShowModal(false);
    }, []);

    const trialModeNow = !apiKey && !deepseekApiKey && !openaiApiKey && !geminiApiKey && isTrialAvailable();

    return (
        <>
            <ChatPanelComponent
                lang={lang}
                collapsed={collapsed}
                onToggleCollapse={onToggleCollapse}
                messages={messages}
                running={running}
                drafting={drafting}
                hasApiKey={
                    isDeepSeekModel(getModel()) ? !!deepseekApiKey :
                        isOpenAIModel(getModel()) ? !!openaiApiKey :
                            isGeminiModel(getModel()) ? !!geminiApiKey : !!apiKey
                }
                trialMode={trialModeNow}
                currentModel={currentModel}
                blocksEnabled={trialModeNow ? false : blocksEnabled}
                mode={mode}
                onSetMode={handleSetMode}
                onSend={handleSend}
                onStop={handleStop}
                onOpenSettings={() => setShowModal(true)}
                onToggleBlocks={() => setBlocksEnabled(v => !v)}
                onSetBlocksEnabled={v => setBlocksEnabled(v)}
            />
            {showDisclosure && (
                <DisclosureModal
                    lang={lang}
                    onAccept={() => {
                        localStorage.setItem(DISCLOSURE_STORAGE_KEY, '1');
                        setShowDisclosure(false);
                    }}
                />
            )}
            {showModal && (
                <ApiKeyModal
                    lang={lang}
                    initialApiKey={apiKey}
                    initialDeepSeekApiKey={deepseekApiKey}
                    initialOpenAIApiKey={openaiApiKey}
                    initialGeminiApiKey={geminiApiKey}
                    initialModel={getModel()}
                    onSave={handleSaveApiKey}
                    onClose={() => setShowModal(false)}
                />
            )}
        </>
    );
};

export default ChatPanel;
