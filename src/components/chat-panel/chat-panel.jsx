import React, {useEffect, useRef, useState} from 'react';
import scratchblocks from 'scratchblocks';
import jaLocale from 'scratchblocks/locales/ja.json';
import jaHiraLocale from 'scratchblocks/locales/ja-Hira.json';
import zhCnLocale from 'scratchblocks/locales/zh-cn.json';
import {BLOCK_LABELS, getBlockLabel, findOpcodeByJaName, findOpcodeByZhName, isRedundantJaAnnotation} from '../../agent/block-labels.js';
import {isDeepSeekModel, isOpenAIModel, isGeminiModel} from '../../agent/agent-loop';
import {STRINGS, SUGGESTIONS_BY_LANG, draftingChars, pricingLabel} from '../../i18n';
import './chat-panel.css';

// 注册已支持语言的区域设置（scratchblocks 用以决定 token 颜色/形状）
// zh-tw 暂不注册：覆盖率与 zh-cn 接近，繁中用户走 en fallback 即可（保持简洁）
scratchblocks.loadLanguages({'ja': jaLocale, 'ja-Hira': jaHiraLocale, 'zh-cn': zhCnLocale});

// 根据语言决定传递给 scratchblocks 的 languages（fallback chain）
// - ja: 先 ja，再 en（覆盖未翻译 token）
// - zh: 先 zh-cn，再 en
// - 其他（含 en）: 仅 en
const getSbLanguages = lang => {
    if (lang === 'ja') return ['ja', 'en'];
    if (lang === 'zh') return ['zh-cn', 'en'];
    return ['en'];
};

// 用于 getBlockLabel 的 scratchblocks locale 选择（必须是 loadLanguages 注册过的 key）
const getSbBlockLang = lang => {
    if (lang === 'ja') return 'ja';
    if (lang === 'zh') return 'zh-cn';
    return 'en';
};

// 多语言区块名 → opcode 的反向查找。
// 依次尝试 JA → ZH → null。
// ZH 走 normalizeJaName 的同样规则（中文也用同一规范化去除参数/菜单值/标点）。
const resolveOpcodeFromText = text => findOpcodeByJaName(text) || findOpcodeByZhName(text) || null;

// 将 opcode 转换为 scratchblocks SVG 的组件
//
// 检测模式从"已注册 opcode（BLOCK_LABELS 的键）的完全匹配列表"自动生成
// 不是通用的标识符模式推测，因此已注册 opcode 的
// 遗漏（带数字・多个下划线等）在结构上不会发生，
// 添加 opcode 后自动成为检测对象。
// 按较长键优先排列，用 lookaround 确保前后不是单词字符
//（例如：不会误匹配 control_if_else 中的 control_if）。
const OPCODE_RE = new RegExp(
    `(?<![A-Za-z0-9_])(${
        Object.keys(BLOCK_LABELS)
            .sort((a, b) => b.length - a.length)
            .join('|')
    })(?![A-Za-z0-9_])`,
    'g'
);

const BlockImage = ({opcode, keyStr, lang = 'ja'}) => {
    const ref = useRef(null);
    // scratchblocks locale: ja 用 ja, zh 用 zh-cn, 其他用 en
    const sbLang = getSbBlockLang(lang);
    const label = getBlockLabel(opcode, sbLang);

    useEffect(() => {
        if (!ref.current || !label) return;
        ref.current.innerHTML = '';
        const doc = scratchblocks.parse(label, {inline: true, languages: getSbLanguages(lang)});
        const svg = scratchblocks.render(doc, {style: 'scratch3', scale: 0.65});
        ref.current.appendChild(svg);
    }, [label, lang]);

    // 在钩子调用后 early return（遵守 React 的钩子顺序规则）
    if (!label) return <code key={keyStr}>{opcode}</code>;

    return (
        <span
            ref={ref}
            style={{display: 'inline-block', verticalAlign: 'middle', margin: '0 1px'}}
            title={opcode}
        />
    );
};

// 将文本中的 opcode 转换为 BlockImage
// 将用引号包裹的日语区块名（如「ずっと」「10歩動かす」等）
// 转换为区块图像（对不用 opcode 书的模型的逻辑侧补救）
const JA_QUOTED_RE = /「([^「」]{2,40})」/g;

// 如果区块图像紧跟「(相同区块的日语名)」则冗余，跳过不显示
// 例: motion_movesteps(10歩動かす) → 仅显示图像
const PAREN_ANNOTATION_RE = /^\s*[（(]([^（）()]{1,50})[）)]/;
const skipRedundantAnnotation = (text, pos, opcode) => {
    const m = text.slice(pos).match(PAREN_ANNOTATION_RE);
    if (m && isRedundantJaAnnotation(m[1], opcode)) return pos + m[0].length;
    return pos;
};

const renderJaQuotedBlocks = (text, keyPrefix, lang) => {
    const parts = [];
    let last = 0;
    let match;
    JA_QUOTED_RE.lastIndex = 0;
    while ((match = JA_QUOTED_RE.exec(text)) !== null) {
        const opcode = resolveOpcodeFromText(match[1]);
        if (!opcode) continue;
        if (match.index > last) parts.push(text.slice(last, match.index));
        parts.push(<BlockImage key={`${keyPrefix}-ja-${match.index}`} opcode={opcode} keyStr={`${keyPrefix}-ja-${match.index}`} lang={lang} />);
        last = skipRedundantAnnotation(text, match.index + match[0].length, opcode);
        JA_QUOTED_RE.lastIndex = last;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts.length > 0 ? parts : [text];
};

const renderWithBlocks = (text, keyPrefix, lang) => {
    const parts = [];
    let last = 0;
    let match;
    OPCODE_RE.lastIndex = 0;
    while ((match = OPCODE_RE.exec(text)) !== null) {
        const opcode = match[1];
        if (!BLOCK_LABELS[opcode]) continue;
        if (match.index > last) parts.push(...renderJaQuotedBlocks(text.slice(last, match.index), `${keyPrefix}-${last}`, lang));
        parts.push(<BlockImage key={`${keyPrefix}-blk-${match.index}`} opcode={opcode} keyStr={`${keyPrefix}-${match.index}`} lang={lang} />);
        last = skipRedundantAnnotation(text, match.index + match[0].length, opcode);
        OPCODE_RE.lastIndex = last;
    }
    if (last < text.length) parts.push(...renderJaQuotedBlocks(text.slice(last), `${keyPrefix}-${last}`, lang));
    return parts.length > 0 ? parts : [text];
};

// 将行内标记（**粗体** 和 `代码`）+ opcode 区块图像转换为 React 元素
const renderInline = (text, keyPrefix, lang) => {
    const parts = [];
    text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).forEach((seg, i) => {
        if (/^\*\*[^*]+\*\*$/.test(seg)) {
            parts.push(<strong key={`${keyPrefix}-${i}`}>{renderWithBlocks(seg.slice(2, -2), `${keyPrefix}-${i}`, lang)}</strong>);
        } else if (/^`[^`]+`$/.test(seg)) {
            // 反引号内视为 opcode 并转换为区块图像
            const inner = seg.slice(1, -1);
            if (BLOCK_LABELS[inner]) {
                parts.push(<BlockImage key={`${keyPrefix}-${i}`} opcode={inner} keyStr={`${keyPrefix}-${i}`} lang={lang} />);
            } else {
                parts.push(<code key={`${keyPrefix}-${i}`}>{inner}</code>);
            }
        } else if (seg) {
            parts.push(...renderWithBlocks(seg, `${keyPrefix}-${i}`, lang));
        }
    });
    return parts;
};

// 处理行单位的区块元素（标题・列表・分隔线・代码块）的标记渲染
const renderMarkdownLite = (text, lang) => {
    // 先分割代码块(```...```)，其内部作为纯文本处理
    const segments = text.split(/(```[\s\S]*?```)/g);
    const result = [];

    segments.forEach((seg, segIdx) => {
        if (/^```[\s\S]*```$/.test(seg)) {
            // 去除围栏和语言指定行后直接显示内容
            const inner = seg.replace(/^```[^\n]*\n?/, '').replace(/```$/, '');
            result.push(
                <pre key={`pre-${segIdx}`} style={{
                    background: '#f5f5f5', borderRadius: '4px', padding: '6px 8px',
                    fontSize: '11px', overflowX: 'auto', margin: '4px 0', whiteSpace: 'pre-wrap'
                }}>{inner}</pre>
            );
            return;
        }

        const lines = seg.split('\n');
        let listItems = [];

        const flushList = () => {
            if (listItems.length > 0) {
                result.push(<ul key={`ul-${result.length}`} style={{margin: '4px 0', paddingLeft: '18px'}}>{listItems}</ul>);
                listItems = [];
            }
        };

        lines.forEach((line, i) => {
            const key = `${segIdx}-${i}`;
            const h2 = line.match(/^##\s+(.+)/);
            const h3 = line.match(/^###\s+(.+)/);
            const li = line.match(/^[-*]\s+(.+)/);
            const ol = line.match(/^\d+\.\s+(.+)/);
            const hr = /^---+$/.test(line.trim());

            if (h2) {
                flushList();
                result.push(<strong key={key} style={{display: 'block', fontSize: '14px', marginTop: '6px'}}>{renderInline(h2[1], key, lang)}</strong>);
            } else if (h3) {
                flushList();
                result.push(<strong key={key} style={{display: 'block', marginTop: '4px'}}>{renderInline(h3[1], key, lang)}</strong>);
            } else if (li) {
                listItems.push(<li key={key}>{renderInline(li[1], key, lang)}</li>);
            } else if (ol) {
                listItems.push(<li key={key}>{renderInline(ol[1], key, lang)}</li>);
            } else if (hr) {
                flushList();
                result.push(<hr key={key} style={{border: 'none', borderTop: '1px solid #ddd', margin: '6px 0'}} />);
            } else {
                flushList();
                if (line === '') {
                    result.push(<br key={key} />);
                } else {
                    result.push(<span key={key} style={{display: 'block'}}>{renderInline(line, key, lang)}</span>);
                }
            }
        });
        flushList();
    });

    return result;
};

// 工具行（错误时点击可展开/收起详情，可复制）
const ToolRow = ({message, lang = 'ja'}) => {
    const t = STRINGS[lang];
    const [expanded, setExpanded] = useState(false);
    const [copied, setCopied] = useState(false);
    const hasDetail = message.status === 'error' && message.detail;

    const copyDetail = e => {
        e.stopPropagation();
        navigator.clipboard.writeText(message.detail).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    };

    return (
        <div className="as-chat-tool-wrap">
            <div
                className={`as-chat-message as-chat-tool${hasDetail ? ' as-chat-tool-clickable' : ''}`}
                title={hasDetail ? t.toolErrorTitle : undefined}
                onClick={hasDetail ? () => setExpanded(v => !v) : undefined}
            >
                <span className="as-chat-tool-icon">🔧</span>
                <span className="as-chat-tool-text">{message.text}</span>
                {message.status === 'running' && <span className="as-chat-tool-spinner" />}
                {message.status === 'error' && <span className="as-chat-tool-status">⚠️</span>}
                {message.status === 'done' && <span className="as-chat-tool-status">✓</span>}
            </div>
            {expanded && hasDetail && (
                <div className="as-chat-tool-detail">
                    <pre className="as-chat-tool-detail-text">{message.detail}</pre>
                    <button className="as-chat-tool-copy" onClick={copyDetail}>
                        {copied ? t.toolCopied : t.toolCopy}
                    </button>
                </div>
            )}
        </div>
    );
};

const MessageRow = ({message, lang = 'ja'}) => {
    if (message.role === 'tool') {
        return <ToolRow message={message} lang={lang} />;
    }
    if (message.role === 'error') {
        return <div className="as-chat-message as-chat-error">{message.text}</div>;
    }
    if (message.role === 'assistant') {
        return (
            <div className="as-chat-message as-chat-assistant">
                {renderMarkdownLite(message.text, lang)}
            </div>
        );
    }
    return (
        <div className="as-chat-message as-chat-user">
            {message.text}
        </div>
    );
};

// 各模型提供商的定价页面（成本概算误差大，因此提供官方定价表链接）
const PRICING_PAGES = {
    anthropic: {label: 'Anthropic', url: 'https://docs.claude.com/en/docs/about-claude/pricing'},
    deepseek: {label: 'DeepSeek', url: 'https://api-docs.deepseek.com/quick_start/pricing'},
    openai: {label: 'OpenAI', url: 'https://platform.openai.com/docs/pricing'},
    gemini: {label: 'Google Gemini', url: 'https://ai.google.dev/gemini-api/docs/pricing'}
};
const pricingPageFor = model => {
    if (isDeepSeekModel(model)) return PRICING_PAGES.deepseek;
    if (isOpenAIModel(model)) return PRICING_PAGES.openai;
    if (isGeminiModel(model)) return PRICING_PAGES.gemini;
    return PRICING_PAGES.anthropic;
};

// 响应等待指示器（工具输入生成中显示其进度）
const ThinkingRow = ({drafting, lang = 'ja'}) => (
    <div className="as-chat-message as-chat-tool">
        <span className="as-chat-tool-spinner" />
        <span className="as-chat-tool-text">
            {drafting ?
                `${drafting.label}...${draftingChars(lang, drafting.chars)}` :
                STRINGS[lang].thinking}
        </span>
    </div>
);

const ChatPanel = ({
    lang = 'ja',
    collapsed,
    onToggleCollapse,
    messages,
    running,
    drafting,
    hasApiKey,
    trialMode,
    currentModel,
    blocksEnabled,
    mode = 'programmer',
    onSetMode,
    onSend,
    onStop,
    onOpenSettings,
    onToggleBlocks,
    onSetBlocksEnabled
}) => {
    const t = STRINGS[lang];
    const SUGGESTIONS = SUGGESTIONS_BY_LANG[lang];
    const canSend = hasApiKey || trialMode;
    const [input, setInput] = useState('');
    const historyRef = useRef(null);
    const sentHistory = useRef([]);   // 已发送文本的历史
    const historyIndex = useRef(-1);  // -1 = 当前输入、0以上 = 历史参照中
    const savedInput = useRef('');    // 暂存历史遍历前的输入

    useEffect(() => {
        const el = historyRef.current;
        if (el) {
            el.scrollTop = el.scrollHeight;
        }
    }, [messages, running]);

    // 流式显示中・工具执行中不叠加显示"思考中..."
    //（但工具输入生成中（drafting）作为进度始终显示）
    const lastMessage = messages[messages.length - 1];
    const showThinking = running && (drafting || !(
        (lastMessage && lastMessage.role === 'assistant' && lastMessage.streaming) ||
        (lastMessage && lastMessage.role === 'tool' && lastMessage.status === 'running')
    ));

    const submit = () => {
        const text = input.trim();
        if (!text || running) return;
        sentHistory.current = [text, ...sentHistory.current].slice(0, 100);
        historyIndex.current = -1;
        savedInput.current = '';
        setInput('');
        // 显式传递发送时画面显示的值，
        // 即使父侧的 useCallback 捕获了旧的 state，状态也不会错位。
        onSend(text, {blocksEnabled});
    };

    const handleKeyDown = e => {
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
            return;
        }
        const history = sentHistory.current;
        if (e.key === 'ArrowUp' && e.target.selectionStart === 0 && history.length > 0) {
            e.preventDefault();
            if (historyIndex.current === -1) savedInput.current = input;
            const next = Math.min(historyIndex.current + 1, history.length - 1);
            historyIndex.current = next;
            setInput(history[next]);
        } else if (e.key === 'ArrowDown' && historyIndex.current >= 0) {
            e.preventDefault();
            const next = historyIndex.current - 1;
            historyIndex.current = next;
            setInput(next === -1 ? savedInput.current : history[next]);
        }
    };

    if (collapsed) return null;

    return (
        <div className="as-chat-panel">
            <div className="as-chat-header">
                <button
                    className="as-chat-collapse-button"
                    title={t.closeAssistant}
                    onClick={onToggleCollapse}
                >▶</button>
                <span className="as-chat-title">{t.headerTitle}</span>
                {onSetMode && (
                    <div className="as-chat-mode-group" role="group" aria-label="agent mode">
                        <button
                            type="button"
                            className={`as-chat-mode-btn${mode === 'programmer' ? ' active' : ''}`}
                            title={t.modeProgramHint}
                            disabled={running}
                            onClick={() => onSetMode('programmer')}
                        >{t.modeProgram}</button>
                        <button
                            type="button"
                            className={`as-chat-mode-btn${mode === 'actor' ? ' active' : ''}`}
                            title={t.modeActorHint}
                            disabled={running}
                            onClick={() => onSetMode('actor')}
                        >{t.modeActor}</button>
                    </div>
                )}
                <button
                    className="as-chat-settings-button"
                    title={t.settings}
                    onClick={onOpenSettings}
                >⚙️</button>
            </div>
            <div className="as-chat-history" ref={historyRef}>
                {messages.length === 0 && (
                    <div className="as-chat-placeholder">
                        {t.placeholderLine1}<br />
                        {t.placeholderExample}
                    </div>
                )}
                {messages.map((m, i) => <MessageRow key={i} message={m} lang={lang} />)}
                {showThinking && <ThinkingRow drafting={drafting} lang={lang} />}
            </div>
            <div className="as-chat-input-area">
                {currentModel && (
                    <div className="as-chat-cost">
                        <span style={{marginRight: '6px', opacity: 0.7}}>[{currentModel}]</span>
                        <a href={pricingPageFor(currentModel).url} target="_blank" rel="noreferrer">
                            {pricingLabel(lang, pricingPageFor(currentModel).label)}
                        </a>
                    </div>
                )}
                {trialMode && (
                    <div className="as-chat-trial" onClick={onOpenSettings}>
                        {t.trialBanner}
                    </div>
                )}
                {!canSend && (
                    <div className="as-chat-no-key" onClick={onOpenSettings}>
                        {t.noKey}
                    </div>
                )}
                {mode === 'programmer' && (
                    <div
                        className="as-chat-toggle-row"
                        title={trialMode ? t.toggleDisabledTitle : undefined}
                    >
                        <span className="as-chat-toggle-desc">{t.toggleBlocks}</span>
                        <span
                            className={`as-chat-toggle-switch${!trialMode && blocksEnabled ? ' as-chat-toggle-on' : ''}${trialMode ? ' as-chat-toggle-disabled' : ''}`}
                            onClick={trialMode ? undefined : onToggleBlocks}
                        >
                            <span className="as-chat-toggle-knob" />
                        </span>
                    </div>
                )}
                <textarea
                    className="as-chat-input"
                    value={input}
                    placeholder={t.inputPlaceholder}
                    rows={5}
                    disabled={!canSend}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                />
                {!running && (
                    <div className="as-chat-suggestions">
                        {SUGGESTIONS.map(s => (
                            <button
                                key={s.label}
                                className="as-chat-suggestion-badge"
                                disabled={!canSend}
                                onClick={() => {
                                    if (!canSend) return;
                                    // 同步 UI 显示（state）的同时，通过参数确保传递发送值
                                    //（因为 state 更新是异步的，所以在 onSend 的参数中显式指定）
                                    if (s.disableBlocks && onSetBlocksEnabled) {
                                        onSetBlocksEnabled(false);
                                    }
                                    onSend(s.text, {forceBlocksDisabled: !!s.disableBlocks});
                                }}
                            >{s.label}</button>
                        ))}
                    </div>
                )}
                {running ? (
                    <button className="as-chat-button as-chat-stop" onClick={onStop}>
                        {t.stop}
                    </button>
                ) : (
                    <button
                        className="as-chat-button as-chat-send"
                        disabled={!canSend || !input.trim()}
                        onClick={submit}
                    >
                        {t.send}
                    </button>
                )}
            </div>
        </div>
    );
};

export default ChatPanel;
