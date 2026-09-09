import { useApp } from '@/contexts/AppContext';
import type { LeftNavTab } from '@/types';
import { MessageSquare, Database, Share2, Bot, ClipboardList, History, FileText, GitCompareArrows, Upload } from 'lucide-react';
import { motion } from 'framer-motion';
import ThemeToggle from '@/components/shared/ThemeToggle';

const NAV_ITEMS: { id: LeftNavTab; label: string; icon: React.ReactNode }[] = [
  { id: 'chat',     label: '对话',   icon: <MessageSquare className="w-[18px] h-[18px]" /> },
  { id: 'volunteer',label: '志愿表', icon: <ClipboardList className="w-[18px] h-[18px]" /> },
  { id: 'compare',  label: '对比',   icon: <GitCompareArrows className="w-[18px] h-[18px]" /> },
  { id: 'graph',    label: '图谱',   icon: <Share2 className="w-[18px] h-[18px]" /> },
  { id: 'agent',    label: 'Agent',  icon: <Bot className="w-[18px] h-[18px]" /> },
  { id: 'upload',   label: '上传',   icon: <Upload className="w-[18px] h-[18px]" /> },
  { id: 'history',  label: '历史',   icon: <History className="w-[18px] h-[18px]" /> },
  { id: 'report',   label: '报告',   icon: <FileText className="w-[18px] h-[18px]" /> },
  { id: 'resources',label: '资源',   icon: <Database className="w-[18px] h-[18px]" /> },
];

export default function Sidebar() {
  const { state, dispatch } = useApp();

  return (
    <nav className="w-14 bg-[hsl(var(--rail))] border-r border-black/20 flex flex-col items-center py-3 z-30 shrink-0">
      {/* Logo */}
      <div className="mb-4">
        <div className="w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm shadow-xs">
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
              onClick={() => dispatch({ type: 'SET_LEFT_NAV', payload: item.id })}
              className={`relative w-10 h-10 rounded-lg flex items-center justify-center transition-colors duration-150 ${
                isActive
                  ? 'bg-white/10 text-white'
                  : 'text-white/55 hover:text-white hover:bg-white/5'
              }`}
              title={item.label}
            >
              {item.icon}
              {isActive && (
                <motion.div
                  layoutId="sidebarActive"
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary-foreground rounded-r-sm"
                />
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Theme + Version */}
      <div className="mt-auto flex flex-col items-center gap-2 mb-2">
        <ThemeToggle />
        <span className="text-[11px] text-white/40 tabular-nums">v2.1</span>
      </div>
    </nav>
  );
}
