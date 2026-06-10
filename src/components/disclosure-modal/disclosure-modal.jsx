import React from 'react';
import '../api-key-modal/api-key-modal.css';

// 首次启动时显示的说明弹窗（AI 使用披露）。
// 为了保持粗体强调，按语言准备正文 JSX。
const BODY = {
    ja: {
        title: 'はじめにお読みください',
        accept: 'わかりました',
        content: (
            <>
                <p>
                    右側の「AI アシスタント」とおしゃべりする相手は、
                    人間ではなく <strong>AI</strong>です。
                </p>
                <ul className="as-modal-list">
                    <li>18歳未満の人は、<strong>保護者や先生などの大人といっしょに</strong>使ってください</li>
                    <li>入力した内容は AI のサーバに送られます。<strong>名前・住所などの個人情報は入力しない</strong>でください</li>
                    <li>AI の答えはまちがっていることもあります</li>
                </ul>
            </>
        )
    },
    en: {
        title: 'Please read this first',
        accept: 'Got it',
        content: (
            <>
                <p>
                    The "AI Assistant" on the right that you chat with is
                    not a human but an <strong>AI</strong>.
                </p>
                <ul className="as-modal-list">
                    <li>If you are under 18, please use it <strong>together with an adult such as a parent or teacher</strong></li>
                    <li>What you type is sent to the AI's server. <strong>Do not enter personal information such as your name or address</strong></li>
                    <li>The AI's answers can sometimes be wrong</li>
                </ul>
            </>
        )
    },
    zh: {
        title: '请先阅读此处',
        accept: '我知道了',
        content: (
            <>
                <p>
                    右侧的"AI 助手"聊天对象不是人类，而是 <strong>AI</strong>。
                </p>
                <ul className="as-modal-list">
                    <li>未满18岁者请<strong>与家长或老师等大人一起</strong>使用</li>
                    <li>输入的内容会被发送到 AI 服务器。<strong>请勿输入姓名、地址等个人信息</strong></li>
                    <li>AI 的回答有时也可能出错</li>
                </ul>
            </>
        )
    }
};

const DisclosureModal = ({lang = 'ja', onAccept}) => {
    const b = BODY[lang] || BODY.ja;
    return (
        <div className="as-modal-overlay">
            <div className="as-modal">
                <div className="as-modal-header">{b.title}</div>
                <div className="as-modal-body">
                    {b.content}
                </div>
                <div className="as-modal-footer">
                    <button className="as-modal-button as-modal-save" onClick={onAccept}>
                        {b.accept}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DisclosureModal;
