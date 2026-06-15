import { useApp } from '@/contexts/AppContext';
import { motion } from 'framer-motion';
import { MessageCircle } from 'lucide-react';

export default function AgentPlaza() {
  const { state, dispatch } = useApp();

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-800 mb-1">Agent 广场</h2>
        <p className="text-sm text-slate-500">选择不同角色的 Agent 进行私聊，获取多元视角</p>
      </div>

      {/* Master Agent - Highlighted */}
      <div className="mb-6">
        <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">主控协调</h3>
        {state.agents.filter(a => a.id === 'master').map(agent => (
          <motion.div
            key={agent.id}
            whileHover={{ scale: 1.01 }}
            className="bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 rounded-xl p-4 flex items-center gap-4 cursor-pointer"
            onClick={() => {
              dispatch({ type: 'SET_CURRENT_AGENT', payload: agent.id });
              dispatch({ type: 'SET_LEFT_NAV', payload: 'chat' });
              dispatch({ type: 'SET_RIGHT_PANEL', payload: 'agentChat' });
            }}
          >
            <div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl shrink-0"
              style={{ backgroundColor: agent.color }}>
              {agent.avatar}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-800">{agent.name}</span>
                <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">{agent.tagline}</span>
              </div>
              <p className="text-sm text-slate-500 mt-1 truncate">{agent.quotes[0]}</p>
            </div>
            <MessageCircle className="w-5 h-5 text-blue-400 shrink-0" />
          </motion.div>
        ))}
      </div>

      {/* Other Agents */}
      <div>
        <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">专业顾问</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {state.agents.filter(a => a.id !== 'master').map((agent, idx) => (
            <motion.div
              key={agent.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              whileHover={{ scale: 1.02, y: -2 }}
              className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => {
                dispatch({ type: 'SET_CURRENT_AGENT', payload: agent.id });
                dispatch({ type: 'SET_LEFT_NAV', payload: 'chat' });
                dispatch({ type: 'SET_RIGHT_PANEL', payload: 'agentChat' });
              }}
            >
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl shrink-0"
                style={{ backgroundColor: agent.color + '20' }}>
                <span style={{ color: agent.color }}>{agent.avatar}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-800 text-sm">{agent.name}</span>
                </div>
                <span className="text-[10px] text-slate-400">{agent.tagline}</span>
                <p className="text-xs text-slate-500 mt-1 truncate">{agent.quotes[0]}</p>
              </div>
              <MessageCircle className="w-4 h-4 text-slate-300 shrink-0" />
            </motion.div>
          ))}
        </div>
      </div>

      {/* Tips */}
      <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
        <div className="text-sm font-medium text-amber-800 mb-1">使用提示</div>
        <p className="text-xs text-amber-600">
          点击任意 Agent 即可进入私聊模式。在对话中，不同 Agent 会从各自的专业角度为你提供建议。
          主控 Agent 可以协调多个 Agent 进行辩论，帮你做出更全面的决策。
        </p>
      </div>
    </div>
  );
}
