import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useDispatch} from 'react-redux';
import GUI, {AppStateHOC, setProjectId, defaultProjectId} from '@scratch/scratch-gui';
import ChatPanel from './containers/chat-panel.jsx';
import {maybeRunSelfTest, maybeRunAgentTest} from './dev/self-test';
import {localeToLang, STRINGS} from './i18n';
import './app.css';

// scratch-gui 菜单栏缺失的中文翻译（scratch-l10n暂无）
const GUI_OVERRIDE_MESSAGES = {
    'zh-cn': {
        'gui.menuBar.settings': '设置',
        'gui.menuBar.debug': '调试'
    },
    'zh-tw': {
        'gui.menuBar.settings': '設置',
        'gui.menuBar.debug': '調試'
    }
};

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
    const prevTargetCount = useRef(null);
    const isInitialized = useRef(false);

    // 检测项目切换并重置聊天历史
    // 策略：当 targets数量恢复到默认值2（stage + cat）时，认为是新建了项目
    useEffect(() => {
        if (!vm || !vm.runtime) return;

        const checkProjectChange = () => {
            try {
                const targets = vm.runtime.targets || [];
                const count = targets.length;

                if (!isInitialized.current) {
                    // 首次检测（VM刚初始化），只标记已初始化，不记录prev值
                    isInitialized.current = true;
                    return;
                }

                // 如果 targets 数量恢复到默认值 2（新建项目默认状态），
                // 且之前记录过不同的值，则认为是新建项目
                if (count === 2 && prevTargetCount.current !== null && prevTargetCount.current !== 2) {
                    setProjectKey(k => k + 1);
                }
                // 只有当数量不是默认值2时才记录（避免初始状态的2被当作"上一个状态"）
                if (count !== 2) {
                    prevTargetCount.current = count;
                }
            } catch (_) { /* ignore */ }
        };
        checkProjectChange();
        const id = setInterval(checkProjectChange, 1000);
        return () => clearInterval(id);
    }, [vm]);
    const handleVmInit = useCallback(newVm => {
        // 在 GUI 调用 setLocale 之前，先包装它以注入我们的覆盖消息
        const vmLocale = newVm.getLocale ? newVm.getLocale() : null;
        if (vmLocale && GUI_OVERRIDE_MESSAGES[vmLocale]) {
            const originalSetLocale = newVm.setLocale.bind(newVm);
            newVm.setLocale = (locale, messages) => {
                // 合并我们的覆盖消息与 GUI 传入的消息
                const mergedMessages = {...messages, ...GUI_OVERRIDE_MESSAGES[vmLocale]};
                return originalSetLocale(locale, mergedMessages);
            };
        }

        window.vm = newVm; // 调试用
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
