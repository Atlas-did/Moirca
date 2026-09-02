import { useApp } from '@/contexts/AppContext';
import { motion, AnimatePresence } from 'framer-motion';
import KnowledgeGraph from '@/components/graph/KnowledgeGraph';
import ResourcesPanel from '@/components/resources/Resources';
import VolunteerTable from '@/components/volunteer/VolunteerTable';
import AgentPlaza from '@/components/agent/AgentPlaza';
import FullChat from '@/components/agent/FullChat';
import HistoryPanel from '@/components/history/HistoryPanel';
import ReportPanel from '@/components/report/ReportPanel';
import AHPMatrix from '@/components/ahp/AHPMatrix';
import FileUploadPanel from '@/components/agent/FileUploadPanel';
import { VersionUpdateButton } from '@/components/shared/VersionUpdate';

export default function LeftPanel() {
  const { state } = useApp();

  const labelMap: Record<string, string> = {
    chat: '多 Agent 对话',
    resources: '数据资源管理',
    graph: '知识图谱',
    agent: 'Agent 广场',
    volunteer: '志愿填报表',
    history: '历史项目列表',
    report: '报告 Markdown 渲染',
    compare: 'AHP 对比',
    upload: '文件上传与分析',
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-50 dark:bg-slate-900 overflow-hidden">
      {/* Top Bar */}
      <div className="h-10 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {labelMap[state.leftNav] || state.leftNav}
          </span>
        </div>
        <VersionUpdateButton />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={state.leftNav}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0"
          >
            {state.leftNav === 'chat' && <FullChat />}
            {state.leftNav === 'resources' && <ResourcesPanel />}
            {state.leftNav === 'graph' && <KnowledgeGraph />}
            {state.leftNav === 'agent' && <AgentPlaza />}
            {state.leftNav === 'volunteer' && <VolunteerTable />}
            {state.leftNav === 'history' && <HistoryPanel />}
            {state.leftNav === 'report' && <ReportPanel />}
            {state.leftNav === 'compare' && <AHPMatrix />}
            {state.leftNav === 'upload' && <FileUploadPanel />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
