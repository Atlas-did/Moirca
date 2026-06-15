import { useRef, useCallback, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { motion, AnimatePresence } from 'framer-motion';
import AgentChat from '@/components/agent/AgentChat';
import GuidedReport from '@/components/report/GuidedReport';
import ReportPanel from '@/components/report/ReportPanel';
import DeepResearch from '@/components/research/DeepResearch';
import FileUploadPanel from '@/components/agent/FileUploadPanel';
import HistoryPanel from '@/components/history/HistoryPanel';
import InterviewPanel from '@/components/interview/InterviewPanel';
import SystemLogPanel from '@/components/logs/SystemLogPanel';
import { MessageSquare, FileText, LayoutTemplate, ChevronRight, ChevronLeft, Search, Upload, History, MessageCircleQuestion, TerminalSquare } from 'lucide-react';
import type { RightPanelTab } from '@/types';

const TABS: { id: RightPanelTab; label: string; icon: React.ReactNode }[] = [
  { id: 'agentChat', label: 'Agent 对话', icon: <MessageSquare className="w-4 h-4" /> },
  { id: 'guided',    label: '分步指南',  icon: <LayoutTemplate className="w-4 h-4" /> },
  { id: 'report',    label: '决策报告',  icon: <FileText className="w-4 h-4" /> },
  { id: 'research',  label: '深度研究',  icon: <Search className="w-4 h-4" /> },
  { id: 'upload',    label: '文件上传',  icon: <Upload className="w-4 h-4" /> },
  { id: 'history',    label: '历史',      icon: <History className="w-4 h-4" /> },
  { id: 'interview',  label: '采访',      icon: <MessageCircleQuestion className="w-4 h-4" /> },
  { id: 'logs',       label: '日志',      icon: <TerminalSquare className="w-4 h-4" /> },
];

export default function RightPanel() {
  const { state, dispatch } = useApp();
  const resizeRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef(false);

  const handleMouseDown = useCallback(() => {
    isResizing.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = window.innerWidth - e.clientX;
      dispatch({ type: 'SET_RIGHT_WIDTH', payload: newWidth });
    };
    const handleMouseUp = () => {
      isResizing.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dispatch]);

  // Collapsed mode
  if (state.rightPanelCollapsed) {
    return (
      <motion.div
        initial={{ x: 30 }}
        animate={{ x: 0 }}
        className="w-11 bg-white border-l border-amber-100 flex flex-col items-center py-2 z-20 shrink-0"
      >
        <button
          onClick={() => dispatch({ type: 'TOGGLE_RIGHT_COLLAPSED', payload: false })}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-stone-400 hover:text-indigo-500 hover:bg-indigo-50 mb-2 transition-colors"
          title="展开面板"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              dispatch({ type: 'SET_RIGHT_PANEL', payload: tab.id });
              dispatch({ type: 'TOGGLE_RIGHT_COLLAPSED', payload: false });
            }}
            className={`w-8 h-8 rounded-lg flex items-center justify-center mb-1 transition-all ${
              state.rightPanel === tab.id
                ? 'text-indigo-500 bg-indigo-50'
                : 'text-stone-400 hover:text-stone-600 hover:bg-stone-50'
            }`}
            title={tab.label}
          >
            {tab.icon}
          </button>
        ))}
      </motion.div>
    );
  }

  return (
    <>
      {/* Resize Handle */}
      <div
        ref={resizeRef}
        onMouseDown={handleMouseDown}
        className="w-1 cursor-col-resize hover:bg-indigo-300/50 active:bg-indigo-400 transition-colors shrink-0 z-20"
      />

      {/* Panel */}
      <motion.div
        initial={{ x: 80, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ type: 'tween', duration: 0.25, ease: 'easeOut' }}
        className="bg-white border-l border-amber-100 flex flex-col overflow-hidden shrink-0"
        style={{ width: state.rightPanelWidth }}
      >
        {/* Tab Bar */}
        <div className="h-11 border-b border-amber-100 flex items-center px-2 gap-1 shrink-0 bg-amber-50/30">
          <button
            onClick={() => dispatch({ type: 'TOGGLE_RIGHT_COLLAPSED', payload: true })}
            className="w-7 h-7 rounded flex items-center justify-center text-stone-400 hover:text-indigo-500 hover:bg-indigo-50 mr-1 transition-colors"
            title="收起面板"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => dispatch({ type: 'SET_RIGHT_PANEL', payload: tab.id })}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                state.rightPanel === tab.id
                  ? 'text-indigo-600 bg-indigo-50 shadow-sm'
                  : 'text-stone-400 hover:text-stone-600 hover:bg-stone-50'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden bg-white">
          <AnimatePresence mode="wait">
            <motion.div
              key={state.rightPanel}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="h-full"
            >
              {state.rightPanel === 'agentChat' && <AgentChat />}
              {state.rightPanel === 'guided' && <GuidedReport />}
              {state.rightPanel === 'report' && <ReportPanel />}
              {state.rightPanel === 'research' && <DeepResearch />}
              {state.rightPanel === 'upload' && <FileUploadPanel />}
              {state.rightPanel === 'history' && <HistoryPanel />}
              {state.rightPanel === 'interview' && <InterviewPanel />}
              {state.rightPanel === 'logs' && <SystemLogPanel />}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </>
  );
}
