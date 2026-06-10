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
    const lang = useScratchLang(vm);
    const handleVmInit = useCallback(newVm => {
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
            />
        </div>
    );
};

export default App;
