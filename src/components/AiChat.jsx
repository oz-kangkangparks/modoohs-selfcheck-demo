import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { askAssistant } from '../lib/gemini';
import { useDiagnosis } from '../hooks/useDiagnosis';

export default function AiChat({ isOpen, onClose, currentQuestion, userAnswers, suggestions = [] }) {
  const { state, dispatch } = useDiagnosis();
  const messages = state.chatHistory || [];
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!loading && isOpen) {
      inputRef.current?.focus();
    }
  }, [loading, isOpen]);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        message: {
          role: 'assistant',
          content: '궁금한 점이 있으면 물어보세요. 법률 용어나 입력 방법을 안내해 드리겠습니다.',
        }
      });
    }
  }, [isOpen, messages.length, dispatch]);

  async function handleSend(text) {
    const msg = text || input.trim();
    if (!msg || loading) return;

    dispatch({ type: 'ADD_CHAT_MESSAGE', message: { role: 'user', content: msg } });
    setInput('');
    setLoading(true);

    try {
      const response = await askAssistant(currentQuestion, userAnswers, msg, messages);
      dispatch({ type: 'ADD_CHAT_MESSAGE', message: { role: 'assistant', content: response } });
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="bottomsheet-overlay"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%', x: '-50%' }}
            animate={{ y: 0, x: '-50%' }}
            exit={{ y: '100%', x: '-50%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="bottomsheet"
            style={{ height: '75vh', maxHeight: 600, display: 'flex', flexDirection: 'column', paddingBottom: 0 }}
          >
            {/* 헤더 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, borderBottom: '1px solid var(--c-border)', marginBottom: 12, flexShrink: 0 }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>AI 도우미</span>
              <button className="app-header__close" onClick={onClose}>&#10005;</button>
            </div>

            {/* 추천 질문 칩 */}
            {suggestions.length > 0 && messages.length <= 1 && (
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 12, borderBottom: '1px solid var(--c-border-light)', marginBottom: 12, flexShrink: 0 }}>
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    className="money-preset"
                    onClick={() => handleSend(s)}
                    style={{ flexShrink: 0 }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* 메시지 목록 */}
            <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 12 }}>
              {messages.map((msg, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    marginBottom: 12,
                  }}
                >
                  <div
                    style={{
                      maxWidth: '85%',
                      padding: '10px 16px',
                      borderRadius: 'var(--radius)',
                      fontSize: 14,
                      lineHeight: 1.6,
                      ...(msg.role === 'user'
                        ? { background: 'var(--c-primary)', color: '#fff' }
                        : { background: 'var(--c-bg)', color: 'var(--c-text)' }),
                    }}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
                  <div style={{ background: 'var(--c-bg)', padding: '10px 16px', borderRadius: 'var(--radius)' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--c-text-muted)', animation: 'bounce .6s infinite' }} />
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--c-text-muted)', animation: 'bounce .6s .15s infinite' }} />
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--c-text-muted)', animation: 'bounce .6s .3s infinite' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* 입력 */}
            <div style={{ display: 'flex', gap: 8, padding: '12px 0 20px', borderTop: '1px solid var(--c-border)', flexShrink: 0 }}>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="궁금한 점을 물어보세요..."
                disabled={loading}
                style={{
                  flex: 1,
                  height: 44,
                  padding: '0 16px',
                  background: 'var(--c-bg)',
                  border: '1.5px solid var(--c-border)',
                  borderRadius: 'var(--radius)',
                  fontSize: 14,
                  outline: 'none',
                }}
              />
              <button
                className="btn-primary"
                style={{ flex: 'none', width: 44, padding: 0 }}
                disabled={!input.trim() || loading}
                onClick={() => handleSend()}
              >
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
