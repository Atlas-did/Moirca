import { useApp } from '@/contexts/AppContext';
import { motion } from 'framer-motion';
import { MessageCircle, Info } from 'lucide-react';

export default function AgentPlaza() {
  const { state, dispatch } = useApp();

  return (
    <div className="h-full overflow-y-auto thin-scrollbar p-5">
      {/* 页首:T0 标题 + T0d 说明 + hairline(v2 §5.2 统一骨架) */}
      <div className="pb-3 border-b border-border mb-4">
        <h2 className="text-lg font-semibold tracking-tight text-foreground mb-1">Agent 广场</h2>
        <p className="text-xs text-muted-foreground mt-1">选择不同角色的 Agent 进行私聊，获取多元视角</p>
      </div>

      {/* Master Agent - 名单行(v2 §5.5) */}
      <div className="mb-5">
        <h3 className="eyebrow mb-2">主控协调</h3>
        <div className="divide-y divide-border">
          {state.agents.filter(a => a.id === 'master').map(agent => (
            <motion.div
              key={agent.id}
              className="list-row h-12 cursor-pointer"
              onClick={() => {
                dispatch({ type: 'SET_CURRENT_AGENT', payload: agent.id });
                dispatch({ type: 'SET_LEFT_NAV', payload: 'chat' });
                dispatch({ type: 'SET_RIGHT_PANEL', payload: 'agentChat' });
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: agent.color, opacity: 0.6 }}
              />
              <span className="text-[13px] font-medium text-primary shrink-0">{agent.name}</span>
              <span className="text-[11px] text-muted-foreground shrink-0">· {agent.tagline}</span>
              <span className="text-xs text-muted-foreground truncate flex-1">{agent.quotes[0]}</span>
              <MessageCircle className="w-4 h-4 text-muted-foreground/40 shrink-0" />
            </motion.div>
          ))}
        </div>
      </div>

      {/* Other Agents - 名单行(v2 §5.5) */}
      <div>
        <h3 className="eyebrow mb-2">专业顾问</h3>
        <div className="divide-y divide-border">
          {state.agents.filter(a => a.id !== 'master').map((agent, idx) => (
            <motion.div
              key={agent.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="list-row h-12 cursor-pointer"
              onClick={() => {
                dispatch({ type: 'SET_CURRENT_AGENT', payload: agent.id });
                dispatch({ type: 'SET_LEFT_NAV', payload: 'chat' });
                dispatch({ type: 'SET_RIGHT_PANEL', payload: 'agentChat' });
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: agent.color, opacity: 0.6 }}
              />
              <span className="text-[13px] font-medium text-foreground shrink-0">{agent.name}</span>
              <span className="text-[11px] text-muted-foreground shrink-0">· {agent.tagline}</span>
              <span className="text-xs text-muted-foreground truncate flex-1">{agent.quotes[0]}</span>
              <MessageCircle className="w-4 h-4 text-muted-foreground/40 shrink-0" />
            </motion.div>
          ))}
        </div>
      </div>

      {/* Tips - 页尾脚注行(v2 §5.5) */}
      <div className="mt-5 border-t border-border pt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-muted-foreground" />
        <p>
          点击任意 Agent 即可进入私聊模式。在对话中，不同 Agent 会从各自的专业角度为你提供建议。
          主控 Agent 可以协调多个 Agent 进行辩论，帮你做出更全面的决策。
        </p>
      </div>
    </div>
  );
}
