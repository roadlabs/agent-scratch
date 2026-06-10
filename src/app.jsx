import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useDispatch} from 'react-redux';
import GUI, {AppStateHOC, setProjectId, defaultProjectId} from '@scratch/scratch-gui';
import ChatPanel from './containers/chat-panel.jsx';
import {maybeRunSelfTest, maybeRunAgentTest} from './dev/self-test';
import {localeToLang, STRINGS} from './i18n';
import './app.css';

// 以 Scratch 的语言(vm.getLocale())为单一真实来源，返回 'ja' | 'en' 的钩子。
// 由于 VM 不发出 locale 变更事件，使用轻量轮询监控，
// 仅在值变化时更新 state（避免不必要的重渲染）。
const useScratchLang = vm => {
    const [lang, setLang] = useState('ja');
    const langRef = useRef('ja');
    useEffect(() => {
        if (!vm || typeof vm.getLocale !== 'function') return undefined;
        const read = () => {
            const next = localeToLang(vm.getLocale());
            if (next !== langRef.current) {
                langRef.current = next;
                setLang(next);
                document.documentElement.lang = next;
            }
        };
        read();
        const id = setInterval(read, 1000);
        return () => clearInterval(id);
    }, [vm]);
    return lang;
};

// 相当于 HashParserHOC：挂载时加载默认项目（含猫）。
const DefaultProjectHOC = WrappedComponent => {
    const DefaultProjectLoader = props => {
        const dispatch = useDispatch();
        useEffect(() => {
            dispatch(setProjectId(defaultProjectId));
        }, [dispatch]);
        return <WrappedComponent {...props} />;
    };
    return DefaultProjectLoader;
};

const WrappedGui = AppStateHOC(DefaultProjectHOC(GUI));

const App = () => {
    const [vm, setVm] = useState(null);
    const [chatCollapsed, setChatCollapsed] = useState(false);
    const [projectKey, setProjectKey] = useState(0); // 用于重置聊天历史
    const lang = useScratchLang(vm);
    const prevTargetIds = useRef(null);
    const isInitialized = useRef(false);

    // 检测项目切换并重置聊天历史
    // 策略：当 targets 的 ID 集合发生显著变化时（新项目会有完全不同的 ID）
    useEffect(() => {
        if (!vm || !vm.runtime) return;

        const checkProjectChange = () => {
            try {
                const targets = vm.runtime.targets || [];
                const count = targets.length;
                // 获取所有 sprite 的 id（唯一标识）
                const targetIds = targets.map(t => t.id).join(',');
                // 获取所有 id 转为 Set 用于比较
                const idSet = new Set(targets.map(t => t.id));

                if (!isInitialized.current) {
                    // 首次检测（VM刚初始化），只标记已初始化，不记录prev值
                    isInitialized.current = true;
                    return;
                }

                // 如果之前的 IDs 存在，且当前 IDs 与之前没有任何重叠，认为是新项目
                if (prevTargetIds.current !== null) {
                    const prevIdSet = new Set(prevTargetIds.current.split(',').filter(Boolean));
                    const hasOverlap = [...idSet].some(id => prevIdSet.has(id));
                    if (!hasOverlap && idSet.size > 0) {
                        setProjectKey(k => k + 1);
                    }
                }
                // 记录 targets IDs
                prevTargetIds.current = targetIds;
            } catch (_) { /* ignore */ }
        };
        checkProjectChange();
        const id = setInterval(checkProjectChange, 1000);
        return () => clearInterval(id);
    }, [vm]);
    const handleVmInit = useCallback(newVm => {
        window.vm = newVm;
        setVm(newVm);
        maybeRunSelfTest(newVm);
        maybeRunAgentTest(newVm);
    }, []);

    // 面板开关会导致 GUI 区域宽度变化，但 Scratch(Blockly) 仅在 resize
    // 事件时才会重新布局，因此每次开关时都要手动触发
    //（否则区块区域右侧会残留旧宽度的空白）
    useEffect(() => {
        window.dispatchEvent(new Event('resize'));
        const t = setTimeout(() => window.dispatchEvent(new Event('resize')), 300);
        return () => clearTimeout(t);
    }, [chatCollapsed]);

    // scratch-gui 菜单栏缺失的中文翻译，通过 DOM 操作注入
    //（scratch-l10n 暂无这些 key 的中文翻译，react-intl 无法通过 setLocale 覆盖）
    useEffect(() => {
        if (lang !== 'zh') return;
        const translations = {
            'Settings': '设置',
            'Debug': '调试',
            'Language': '语言',
            'Theme': '主题',
            'Color Mode': '颜色模式',
            'Light': '浅色',
            'Dark': '深色',
            'High Contrast': '高对比度',
            'Blue': '蓝色',
            'Dinosaur': '恐龙',
            'Orange': '橙色',
            'Pink': '粉色',
            'Purple': '紫色'
        };
        const applyTranslations = () => {
            // 查找菜单项
            const menuItems = document.querySelectorAll('[role="menuitem"]');
            menuItems.forEach(item => {
                const text = item.textContent.trim();
                if (translations[text]) item.textContent = translations[text];
            });
            // 备用：直接搜索包含特定文本的 DOM 节点
            const allSpans = document.querySelectorAll('span');
            allSpans.forEach(span => {
                const text = span.textContent.trim();
                if (translations[text]) span.textContent = translations[text];
            });
        };
        // 延迟执行，等待菜单渲染
        const timer = setTimeout(applyTranslations, 1000);
        // 也监听 DOM 变化以应对动态渲染的菜单
        const observer = new MutationObserver(applyTranslations);
        observer.observe(document.body, {childList: true, subtree: true});
        return () => {
            clearTimeout(timer);
            observer.disconnect();
        };
    }, [lang]);

    return (
        <div className="as-app">
            <div className="as-gui-wrapper">
                <WrappedGui
                    canEditTitle
                    backpackVisible={false}
                    canSave={false}
                    onVmInit={handleVmInit}
                />
            </div>
            {chatCollapsed && (
                <button
                    className="as-chat-reopen"
                    title={STRINGS[lang].openAssistant}
                    onClick={() => setChatCollapsed(false)}
                >💬<span className="as-chat-reopen-label">AI</span></button>
            )}
            <ChatPanel
                vm={vm}
                lang={lang}
                collapsed={chatCollapsed}
                onToggleCollapse={() => setChatCollapsed(c => !c)}
                projectKey={projectKey}
            />
        </div>
    );
};

export default App;
