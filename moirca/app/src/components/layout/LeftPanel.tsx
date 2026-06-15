import { useApp } from '@/contexts/AppContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, Wand2 } from 'lucide-react';
import KnowledgeGraph from '@/components/graph/KnowledgeGraph';
import AHPMatrix from '@/components/ahp/AHPMatrix';
import HistoryPanel from '@/components/history/HistoryPanel';
import SettingsPanel from '@/pages/SettingsPanel';
import FullChat from '@/components/agent/FullChat';
import VolunteerTable from '@/components/volunteer/VolunteerTable';
import AgentPlaza from '@/components/agent/AgentPlaza';
import FileUploadPanel from '@/components/agent/FileUploadPanel';
import PortalSitesPage from '@/components/portal/PortalSitesPage';
import ContributePanel from '@/components/contribute/ContributePanel';

const labelMap: Record<string, string> = {
  chat: '多 Agent 对话',
  graph: '知识图谱',
  volunteer: '志愿填报表',
  agent: 'Agent 广场',
  recommend: '志愿推荐',
  compare: '对比分析',
  history: '历史记录',
  upload: '文件上传',
  portal: '填报入口',
  contribute: '数据贡献',
  settings: '设置',
};

export default function LeftPanel() {
  const { state, dispatch } = useApp();

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-amber-50/30 overflow-hidden">
      {/* Top Bar */}
      <div className="h-12 bg-white/80 backdrop-blur-sm border-b border-amber-100 flex items-center justify-between px-5 shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => dispatch({ type: 'GO_HOME' })}
            className="flex items-center gap-1.5 text-xs font-medium text-stone-400 hover:text-indigo-600 hover:bg-indigo-50 px-2.5 py-1.5 rounded-lg transition-all"
            title="返回首页"
          >
            <Home className="w-3.5 h-3.5" />
            首页
          </button>
          <span className="text-stone-300">/</span>
          <span className="text-sm font-semibold text-stone-700">
            {labelMap[state.leftNav] || state.leftNav}
          </span>
        </div>
        {state.leftNav === 'recommend' && (
          <button
            onClick={() => dispatch({ type: 'START_CUSTOMIZE' })}
            className="flex items-center gap-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-5 py-2.5 rounded-xl transition-all shadow-lg hover:shadow-xl active:scale-95"
          >
            <Wand2 className="w-4 h-4" />
            开始定制志愿
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={state.leftNav}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 overflow-auto"
          >
            {state.leftNav === 'chat' && <FullChat />}
            {state.leftNav === 'graph' && <KnowledgeGraph />}
            {state.leftNav === 'volunteer' && <VolunteerTable />}
            {state.leftNav === 'agent' && <AgentPlaza />}
            {state.leftNav === 'recommend' && <KnowledgeGraph />}
            {state.leftNav === 'compare' && <AHPMatrix />}
            {state.leftNav === 'history' && <HistoryPanel />}
            {state.leftNav === 'upload' && <FileUploadPanel />}
            {state.leftNav === 'portal' && <PortalSitesPage />}
            {state.leftNav === 'contribute' && <ContributePanel />}
            {state.leftNav === 'settings' && <SettingsPanel />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
