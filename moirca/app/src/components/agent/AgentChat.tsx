/**
 * Agent 私聊面板 — 接入 POST /api/chat/stream (SSE 流式)
 */
import { useState, useRef, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { motion } from 'framer-motion';
import { Send, Circle } from 'lucide-react';
import { sendMessageStream, type StreamMeta } from '@/api/chat';

export default function AgentChat() {
  const { state, dispatch } = useApp();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const currentAgent = state.agents.find(a => a.id === state.currentAgentId) || state.agents[0];
  const chatMessages = state.messages.filter(
    m => m.senderId === state.currentAgentId || m.senderId === 'user' || m.isUser
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [chatMessages.length, loading]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const content = input.trim();
    const userMsg = {
      id: `u_${Date.now()}`, senderId: 'user', senderName: state.username,
      content, timestamp: Date.now(), isUser: true,
    };
    dispatch({ type: 'ADD_MESSAGE', payload: userMsg });
    setInput('');
    setLoading(true);

    // 先创建占位消息
    const placeholderId = `a_${Date.now()}`;
    dispatch({ type: 'ADD_MESSAGE', payload: {
      id: placeholderId, senderId: state.currentAgentId,
      senderName: currentAgent.name, content: '',
      timestamp: Date.now(), isUser: false, agentColor: currentAgent.color,
    }});

    const history = state.messages.slice(-10).map(m => ({
      role: m.isUser ? 'user' : 'assistant', content: m.content,
    }));

    try {
      let fullText = '';
      await sendMessageStream(
        { message: content, agent_id: state.currentAgentId, history },
        (meta: StreamMeta) => {
          dispatch({ type: 'UPDATE_MESSAGE_CONTENT', payload: { id: placeholderId, content: '' } });
        },
        (chunk: string) => {
          fullText += chunk;
          dispatch({ type: 'UPDATE_MESSAGE_CONTENT', payload: { id: placeholderId, content: fullText } });
        },
        () => {},
      );
      if (!fullText) {
        dispatch({ type: 'UPDATE_MESSAGE_CONTENT', payload: { id: placeholderId, content: '…' } });
      }
    } catch {
      dispatch({ type: 'UPDATE_MESSAGE_CONTENT', payload: { id: placeholderId, content: '抱歉，我暂时无法回复。请检查后端服务是否启动。' } });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-[var(--bg-panel)]">
      <div className="h-12 border-b border-[var(--border)] flex items-center px-3 gap-2 shrink-0">
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm"
          style={{ backgroundColor: currentAgent.color }}>
          {currentAgent.avatar}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>{currentAgent.name}</div>
          <div className="text-[10px] text-slate-400 flex items-center gap-1">
            <Circle className="w-2 h-2 fill-green-400 text-green-400" />
            {loading ? '回复中...' : '在线'}
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {chatMessages.map(msg => (
          <motion.div
            key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className={`flex ${msg.isUser ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
              msg.isUser
                ? 'bg-blue-500 text-white rounded-br-md'
                : 'bg-[var(--card)] border border-[var(--border)] text-[var(--text)] rounded-bl-md'
            }`}>
              {!msg.isUser && <div className="text-[10px] mb-0.5 opacity-70">{msg.senderName}</div>}
              <div className="leading-relaxed whitespace-pre-wrap">
                {msg.content}
                {loading && msg.id === chatMessages[chatMessages.length - 1]?.id && (
                  <span className="inline-block w-1.5 h-4 bg-current ml-0.5 animate-pulse align-middle" />
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="border-t border-[var(--border)] p-2 shrink-0">
        <div className="flex gap-2">
          <input
            type="text" value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder={`对 ${currentAgent.name} 说点什么...`}
            disabled={loading}
            className="flex-1 bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-50"
          />
          <motion.button
            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="w-9 h-9 rounded-lg bg-blue-500 text-white flex items-center justify-center disabled:opacity-40 transition-opacity"
          >
            <Send className="w-4 h-4" />
          </motion.button>
        </div>
      </div>
    </div>
  );
}
