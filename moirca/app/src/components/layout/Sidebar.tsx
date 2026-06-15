import { useApp } from '@/contexts/AppContext';
import type { LeftNavTab } from '@/types';
import { Sparkles, GitCompareArrows, History, Settings, Globe, Database } from 'lucide-react';
import { motion } from 'framer-motion';

const NAV_ITEMS: { id: LeftNavTab; label: string; icon: React.ReactNode }[] = [
  { id: 'recommend', label: '推荐',   icon: <Sparkles className="w-5 h-5" /> },
  { id: 'compare',  label: '对比',   icon: <GitCompareArrows className="w-5 h-5" /> },
  { id: 'portal',   label: '填报入口',icon: <Globe className="w-5 h-5" /> },
  { id: 'contribute',label:'数据贡献',icon: <Database className="w-5 h-5" /> },
  { id: 'history',  label: '历史',   icon: <History className="w-5 h-5" /> },
  { id: 'settings', label: '设置',   icon: <Settings className="w-5 h-5" /> },
];

export default function Sidebar() {
  const { state, dispatch } = useApp();

  return (
    <nav className="w-16 bg-white border-r border-amber-100 flex flex-col items-center pt-6 z-30 shrink-0">
      {/* Nav Items */}
      <div className="flex-1 flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const isActive = state.leftNav === item.id;
          return (
            <motion.button
              key={item.id}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => dispatch({ type: 'SET_LEFT_NAV', payload: item.id })}
              className={`relative w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 ${
                isActive
                  ? 'text-indigo-600 bg-indigo-50 shadow-sm'
                  : 'text-stone-400 hover:text-stone-600 hover:bg-stone-50'
              }`}
              title={item.label}
            >
              {item.icon}
              {isActive && (
                <motion.div
                  layoutId="sidebarActive"
                  className="absolute -left-3 top-1/2 -translate-y-1/2 w-1 h-6 bg-indigo-500 rounded-r-full"
                />
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Version */}
      <div className="mt-auto">
        <span className="text-[10px] text-stone-300 font-mono tracking-wide">v2.1</span>
      </div>
    </nav>
  );
}
