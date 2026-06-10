import React, {useState} from 'react';
import {isDeepSeekModel, isOpenAIModel, isGeminiModel} from '../../agent/agent-loop';
import {STRINGS} from '../../i18n';
import './api-key-modal.css';

// label 是模型名 + 语言别的补充注释({ja, en, zh})
const MODELS = [
    {id: 'deepseek-chat', name: 'DeepSeek V3', note: {ja: '(低コスト・高性能) ★推奨', en: '(low cost, high performance) ★recommended', zh: '(低成本・高性能) ★推荐'}, provider: 'deepseek'},
    {id: 'deepseek-reasoner', name: 'DeepSeek R1', note: {ja: '(推論特化)', en: '(reasoning-focused)', zh: '(推理专用)'}, provider: 'deepseek'},
    {id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', note: {ja: '(最速・最安)', en: '(fastest, cheapest)', zh: '(最快・最便宜)'}, provider: 'anthropic'},
    {id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', note: {ja: '(バランス型)', en: '(balanced)', zh: '(均衡型)'}, provider: 'anthropic'},
    {id: 'claude-opus-4-8', name: 'Claude Opus 4.8', note: {ja: '(最高性能・高コスト)', en: '(top performance, high cost)', zh: '(最高性能・高成本)'}, provider: 'anthropic'},
    {id: 'gpt-5.1', name: 'GPT-5.1', note: {ja: '(高性能)', en: '(high performance)', zh: '(高性能)'}, provider: 'openai'},
    {id: 'gpt-5-mini', name: 'GPT-5 mini', note: {ja: '(低コスト)', en: '(low cost)', zh: '(低成本)'}, provider: 'openai'},
    {id: 'gpt-5-nano', name: 'GPT-5 nano', note: {ja: '(最速・最安)', en: '(fastest, cheapest)', zh: '(最快・最便宜)'}, provider: 'openai'},
    {id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', note: {ja: '(高性能)', en: '(high performance)', zh: '(高性能)'}, provider: 'gemini'},
    {id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', note: {ja: '(バランス型)', en: '(balanced)', zh: '(均衡型)'}, provider: 'gemini'},
    {id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite', note: {ja: '(最速・最安)', en: '(fastest, cheapest)', zh: '(最快・最便宜)'}, provider: 'gemini'}
];

const OPTGROUP_LABELS = {
    ja: {deepseek: 'DeepSeek', anthropic: 'Anthropic (Claude)', openai: 'OpenAI (GPT)', gemini: 'Google (Gemini)'},
    en: {deepseek: 'DeepSeek', anthropic: 'Anthropic (Claude)', openai: 'OpenAI (GPT)', gemini: 'Google (Gemini)'},
    zh: {deepseek: 'DeepSeek', anthropic: 'Anthropic (Claude)', openai: 'OpenAI (GPT)', gemini: 'Google (Gemini)'}
};

const modelLabel = (m, lang) => `${m.name}${m.note[lang] || m.note.ja}`;

const ApiKeyModal = ({lang = 'ja', initialApiKey, initialDeepSeekApiKey, initialOpenAIApiKey, initialGeminiApiKey, initialModel, onSave, onClose}) => {
    const t = STRINGS[lang];
    const [value, setValue] = useState(initialApiKey || '');
    const [deepseekValue, setDeepseekValue] = useState(initialDeepSeekApiKey || '');
    const [openaiValue, setOpenaiValue] = useState(initialOpenAIApiKey || '');
    const [geminiValue, setGeminiValue] = useState(initialGeminiApiKey || '');
    const [model, setModelValue] = useState(initialModel || MODELS[0].id);

    const needsDeepSeek = isDeepSeekModel(model);
    const needsOpenAI = isOpenAIModel(model);
    const needsGemini = isGeminiModel(model);
    const canSave = needsDeepSeek ? deepseekValue.trim() :
        needsOpenAI ? openaiValue.trim() :
            needsGemini ? geminiValue.trim() : value.trim();

    const save = () => {
        if (!canSave) return;
        onSave(value.trim(), model, deepseekValue.trim(), openaiValue.trim(), geminiValue.trim());
    };

    return (
        <div className="as-modal-overlay" onClick={onClose}>
            <div className="as-modal" onClick={e => e.stopPropagation()}>
                <div className="as-modal-header">{t.modalTitle}</div>
                <div className="as-modal-body">
                    <label className="as-modal-label">
                        {t.modalModelLabel}
                        <select
                            className="as-modal-select"
                            value={model}
                            onChange={e => setModelValue(e.target.value)}
                        >
                            <optgroup label={OPTGROUP_LABELS[lang].deepseek}>
                                {MODELS.filter(m => m.provider === 'deepseek').map(m => (
                                    <option key={m.id} value={m.id}>{modelLabel(m, lang)}</option>
                                ))}
                            </optgroup>
                            <optgroup label={OPTGROUP_LABELS[lang].anthropic}>
                                {MODELS.filter(m => m.provider === 'anthropic').map(m => (
                                    <option key={m.id} value={m.id}>{modelLabel(m, lang)}</option>
                                ))}
                            </optgroup>
                            <optgroup label={OPTGROUP_LABELS[lang].openai}>
                                {MODELS.filter(m => m.provider === 'openai').map(m => (
                                    <option key={m.id} value={m.id}>{modelLabel(m, lang)}</option>
                                ))}
                            </optgroup>
                            <optgroup label={OPTGROUP_LABELS[lang].gemini}>
                                {MODELS.filter(m => m.provider === 'gemini').map(m => (
                                    <option key={m.id} value={m.id}>{modelLabel(m, lang)}</option>
                                ))}
                            </optgroup>
                        </select>
                    </label>

                    {!needsDeepSeek && !needsOpenAI && !needsGemini && (
                        <>
                            <p style={{marginTop: '12px'}}>
                                {t.anthropicDesc}
                                {t.keyStoredNote}
                            </p>
                            <input
                                type="password"
                                className="as-modal-input"
                                placeholder="sk-ant-..."
                                value={value}
                                autoFocus
                                onChange={e => setValue(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') save(); }}
                            />
                            <p className="as-modal-hint">
                                {t.hintPrefix}<a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">Anthropic Console</a>{t.hintSuffix}
                            </p>
                        </>
                    )}

                    {needsDeepSeek && (
                        <>
                            <p style={{marginTop: '12px'}}>
                                {t.deepseekDesc}
                                {t.keyStoredNote}
                            </p>
                            <input
                                type="password"
                                className="as-modal-input"
                                placeholder="sk-..."
                                value={deepseekValue}
                                autoFocus
                                onChange={e => setDeepseekValue(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') save(); }}
                            />
                            <p className="as-modal-hint">
                                {t.hintPrefix}<a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noreferrer">DeepSeek Platform</a>{t.hintSuffix}
                            </p>
                        </>
                    )}

                    {needsOpenAI && (
                        <>
                            <p style={{marginTop: '12px'}}>
                                {t.openaiDesc}
                                {t.keyStoredNote}
                            </p>
                            <input
                                type="password"
                                className="as-modal-input"
                                placeholder="sk-..."
                                value={openaiValue}
                                autoFocus
                                onChange={e => setOpenaiValue(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') save(); }}
                            />
                            <p className="as-modal-hint">
                                {t.hintPrefix}<a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">OpenAI Platform</a>{t.hintSuffix}
                            </p>
                        </>
                    )}

                    {needsGemini && (
                        <>
                            <p style={{marginTop: '12px'}}>
                                {t.geminiDesc}
                                {t.keyStoredNote}
                            </p>
                            <input
                                type="password"
                                className="as-modal-input"
                                placeholder="AIza..."
                                value={geminiValue}
                                autoFocus
                                onChange={e => setGeminiValue(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') save(); }}
                            />
                            <p className="as-modal-hint">
                                {t.hintPrefix}<a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">Google AI Studio</a>{t.hintSuffix}
                            </p>
                        </>
                    )}
                </div>
                <div className="as-modal-footer">
                    <button className="as-modal-button as-modal-cancel" onClick={onClose}>{t.modalCancel}</button>
                    <button
                        className="as-modal-button as-modal-save"
                        disabled={!canSave}
                        onClick={save}
                    >{t.modalSave}</button>
                </div>
            </div>
        </div>
    );
};

export default ApiKeyModal;
