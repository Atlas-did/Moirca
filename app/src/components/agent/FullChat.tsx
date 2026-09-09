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
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="h-12 bg-card border-b border-border flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2">
          <Bot className="w-[18px] h-[18px] text-primary" />
          <span className="text-[13px] font-medium text-foreground">多 Agent 对话</span>
          {state.isAgentDebating && (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-[hsl(var(--warning))]">
              <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--warning))] animate-pulse" />
              Agent 辩论中
            </span>
          )}
        </div>
        <button
          onClick={() => dispatch({ type: 'TOGGLE_CHAT_FULLSCREEN' })}
          className="h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent flex items-center justify-center transition-colors"
          title="退出全屏"
        >
          <Minimize2 className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto thin-scrollbar p-4 space-y-3">
        {state.messages.length <= 1 && (
          <div className="text-center py-10">
            <Bot className="w-8 h-8 mx-auto mb-3 text-muted-foreground/40" />
            <h3 className="text-sm font-semibold text-foreground mb-1">Moirca 多 Agent 对话</h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              发送消息后 6 个 Agent 将并行辩论，从不同角度为你分析志愿填报问题
            </p>
          </div>
        )}

        <AnimatePresence>
          {state.messages.map(msg => (
            <motion.div
              key={msg.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
              className={
                msg.isUser
                  ? 'flex justify-end px-2 py-2'
                  : 'px-2 py-2 rounded-md transition-colors duration-150 hover:bg-accent/40'
              }
            >
              {msg.isUser ? (
                <div className="max-w-[80%] rounded-md rounded-br-sm px-3 py-2 text-[13px] leading-[1.6] bg-primary text-primary-foreground">
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                </div>
              ) : (
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: msg.agentColor, opacity: 0.6 }}
                    />
                    <span className="text-[11px] font-medium text-foreground">{msg.senderName}</span>
                    <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
                      {new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="text-[13px] leading-[1.6] text-foreground whitespace-pre-wrap">
                    {msg.content}
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {state.isAgentDebating && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-center py-3">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-[hsl(var(--warning))]">
              <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--warning))] animate-pulse" />
              Agent 辩论中...
            </span>
          </motion.div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border bg-card p-3 shrink-0">
        <div className="flex gap-2 max-w-3xl mx-auto">
          <input
            type="text" value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="输入你的问题，6 个 Agent 将并行辩论..."
            disabled={state.isAgentDebating}
            className="flex-1 h-9 bg-background border border-input rounded-md px-3 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 transition-colors disabled:opacity-50"
          />
          <motion.button
            onClick={handleSend}
            disabled={!input.trim() || state.isAgentDebating}
            className="w-9 h-9 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center shadow-xs disabled:opacity-40 transition-colors"
          >
            <Send className="w-4 h-4" />
          </motion.button>
        </div>
        <p className="text-center text-[11px] text-muted-foreground mt-2">Shift+Enter 换行 · Enter 发送 · 6 Agent 并行辩论</p>
      </div>
    </div>
  );
}
