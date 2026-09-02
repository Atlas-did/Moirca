import { useApp } from '@/contexts/AppContext';
import type { LeftNavTab } from '@/types';
import { MessageSquare, Database, Share2, Bot, ClipboardList, History, FileText, GitCompareArrows, Upload } from 'lucide-react';
import { motion } from 'framer-motion';
import ThemeToggle from '@/components/shared/ThemeToggle';

const NAV_ITEMS: { id: LeftNavTab; label: string; icon: React.ReactNode }[] = [
  { id: 'chat',     label: '对话',   icon: <MessageSquare className="w-5 h-5" /> },
  { id: 'volunteer',label: '志愿表', icon: <ClipboardList className="w-5 h-5" /> },
  { id: 'compare',  label: '对比',   icon: <GitCompareArrows className="w-5 h-5" /> },
  { id: 'graph',    label: '图谱',   icon: <Share2 className="w-5 h-5" /> },
  { id: 'agent',    label: 'Agent',  icon: <Bot className="w-5 h-5" /> },
  { id: 'upload',   label: '上传',   icon: <Upload className="w-5 h-5" /> },
  { id: 'history',  label: '历史',   icon: <History className="w-5 h-5" /> },
  { id: 'report',   label: '报告',   icon: <FileText className="w-5 h-5" /> },
  { id: 'resources',label: '资源',   icon: <Database className="w-5 h-5" /> },
];

export default function Sidebar() {
  const { state, dispatch } = useApp();

  return (
    <nav className="w-14 bg-slate-900 border-r border-slate-700 flex flex-col items-center py-3 z-30 shrink-0">
      {/* Logo */}
      <div className="mb-4">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm"
          style={{ background: 'linear-gradient(135deg, #3b82f6, #06b6d4)' }}>
          M
        </div>
      </div>

      {/* Nav Items */}
      <div className="flex-1 flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => {
          const isActive = state.leftNav === item.id;
          return (
            <motion.button
              key={item.id}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => dispatch({ type: 'SET_LEFT_NAV', payload: item.id })}
              className={`relative w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
                isActive
                  ? 'text-blue-400 bg-blue-500/15'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
              title={item.label}
            >
              {item.icon}
              {isActive && (
                <motion.div
                  layoutId="sidebarActive"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-blue-400 rounded-r-full"
                />
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Theme + Version */}
      <div className="mt-auto flex flex-col items-center gap-2 mb-2">
        <ThemeToggle />
        <span className="text-[10px] text-slate-500 font-mono">v2.1</span>
      </div>
    </nav>
  );
}
