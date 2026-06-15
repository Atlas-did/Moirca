/**
 * 多 Agent 群聊 — 接入 POST /api/chat/
 *
 * 发送消息 → 6 个 Agent 并行回复 → 主控 Agent 总结
 */
import { useState, useRef, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Bot, Minimize2 } from 'lucide-react';
import { sendMessage } from '@/api/chat';

const DEBATE_AGENTS = ['zhang', 'parents', 'senior', 'workplace', 'data', 'risk'];

export default function FullChat() {
  const { state, dispatch } = useApp();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [state.messages.length, state.isAgentDebating]);

  const handleSend = async () => {
    if (!input.trim() || state.isAgentDebating) return;

    const content = input.trim();
    const userMsg = {
      id: `uf_${Date.now()}`, senderId: 'user', senderName: state.username,
      content, timestamp: Date.now(), isUser: true,
    };
    dispatch({ type: 'ADD_MESSAGE', payload: userMsg });
    setInput('');
    dispatch({ type: 'SET_AGENT_DEBATING', payload: true });

    // 并行调用所有 Agent
    const history = state.messages.slice(-10).map(m => ({
      role: m.isUser ? 'user' : 'assistant', content: m.content,
    }));

    const results = await Promise.allSettled(
      DEBATE_AGENTS.map(agentId =>
        sendMessage({ message: content, agent_id: agentId, history })
      )
    );

    dispatch({ type: 'SET_AGENT_DEBATING', payload: false });

    // 逐个添加回复（带延迟模拟真实辩论感）
    const agentMap = new Map(state.agents.map(a => [a.id, a]));
    results.forEach((r, i) => {
      const agentId = DEBATE_AGENTS[i];
      const agent = agentMap.get(agentId) || { name: agentId, color: '#64748b' };
      const reply = r.status === 'fulfilled'
        ? r.value.reply
        : '（该 Agent 暂时无法回复）';

      setTimeout(() => {
        dispatch({ type: 'ADD_MESSAGE', payload: {
          id: `af_${Date.now()}_${i}`,
          senderId: agentId, senderName: agent.name || agentId,
          content: reply, timestamp: Date.now(),
          isUser: false, agentColor: agent.color || '#64748b',
        }});
      }, i * 400);
    });

    // Master 总结（延迟到最后）
    setTimeout(async () => {
      try {
        const data = await sendMessage({
          message: `请用一句话总结以上各 Agent 的观点，给用户一个综合建议。用户原始问题：${content}`,
          agent_id: 'master', history,
        });
        dispatch({ type: 'ADD_MESSAGE', payload: {
          id: `ms_${Date.now()}`, senderId: 'master',
          senderName: '主控 Agent', content: data.reply,
          timestamp: Date.now(), isUser: false, agentColor: '#3b82f6',
        }});
      } catch {
        dispatch({ type: 'ADD_MESSAGE', payload: {
          id: `ms_${Date.now()}`, senderId: 'master',
          senderName: '主控 Agent',
          content: '以上是多 Agent 的综合观点。建议你从就业前景、学校层次、个人兴趣几个角度综合考虑。',
          timestamp: Date.now(), isUser: false, agentColor: '#3b82f6',
        }});
      }
    }, DEBATE_AGENTS.length * 400 + 500);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="h-12 bg-white border-b border-slate-200 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-blue-500" />
          <span className="font-medium text-slate-700">多 Agent 对话</span>
          {state.isAgentDebating && (
            <span className="flex items-center gap-1 text-xs text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-bounce" />
              Agent 辩论中
            </span>
          )}
        </div>
        <button
          onClick={() => dispatch({ type: 'TOGGLE_CHAT_FULLSCREEN' })}
          className="text-slate-400 hover:text-slate-600 transition-colors"
          title="退出全屏"
        >
          <Minimize2 className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {state.messages.length <= 1 && (
          <div className="text-center py-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center">
              <Bot className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-lg font-medium text-slate-700 mb-1">Moirca 多 Agent 对话</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              发送消息后 6 个 Agent 将并行辩论，从不同角度为你分析志愿填报问题
            </p>
          </div>
        )}

        <AnimatePresence>
          {state.messages.map(msg => (
            <motion.div
              key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.isUser ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`flex gap-2 max-w-[80%] ${msg.isUser ? 'flex-row-reverse' : ''}`}>
                {!msg.isUser && (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 mt-1"
                    style={{ backgroundColor: msg.agentColor || '#3b82f6' }}>
                    {state.agents.find(a => a.id === msg.senderId)?.avatar || '🤖'}
                  </div>
                )}
                <div className={`rounded-2xl px-4 py-2.5 text-sm ${
                  msg.isUser
                    ? 'bg-blue-500 text-white rounded-br-md'
                    : 'bg-white border border-slate-200 text-slate-700 rounded-bl-md shadow-sm'
                }`}>
                  {!msg.isUser && (
                    <div className="text-[11px] font-medium mb-1" style={{ color: msg.agentColor }}>
                      {msg.senderName}
                    </div>
                  )}
                  <div className="leading-relaxed whitespace-pre-wrap">{msg.content}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {state.isAgentDebating && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-center py-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-full px-4 py-2 flex items-center gap-2">
              <div className="flex gap-1">
                <span className="w-2 h-2 rounded-full bg-yellow-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full bg-yellow-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full bg-yellow-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-sm text-yellow-700">Agent 辩论中...</span>
            </div>
          </motion.div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-slate-200 p-3 bg-white shrink-0">
        <div className="flex gap-2 max-w-3xl mx-auto">
          <input
            type="text" value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="输入你的问题，6 个 Agent 将并行辩论..."
            disabled={state.isAgentDebating}
            className="flex-1 border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all disabled:opacity-50"
          />
          <motion.button
            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            onClick={handleSend}
            disabled={!input.trim() || state.isAgentDebating}
            className="w-10 h-10 rounded-xl bg-blue-500 text-white flex items-center justify-center disabled:opacity-40 transition-opacity"
          >
            <Send className="w-4 h-4" />
          </motion.button>
        </div>
        <p className="text-center text-[10px] text-slate-400 mt-2">Shift+Enter 换行 · Enter 发送 · 6 Agent 并行辩论</p>
      </div>
    </div>
  );
}
