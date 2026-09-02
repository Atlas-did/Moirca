import { useRef, useCallback, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { motion, AnimatePresence } from 'framer-motion';
import AgentChat from '@/components/agent/AgentChat';
import ChartPanel from '@/components/agent/ChartPanel';
import AHPMatrix from '@/components/ahp/AHPMatrix';
import FileUploadPanel from '@/components/agent/FileUploadPanel';
import DeepResearch from '@/components/research/DeepResearch';
import HistoryPanel from '@/components/history/HistoryPanel';
import ReportPanel from '@/components/report/ReportPanel';
import InterviewPanel from '@/components/interview/InterviewPanel';
import SystemLogPanel from '@/components/logs/SystemLogPanel';
import GuidedReport from '@/components/report/GuidedReport';
import { MessageSquare, BarChart3, GitCompareArrows, Upload, Search, ChevronLeft, ChevronRight, History, FileText, MessageCircleQuestion, TerminalSquare, LayoutTemplate } from 'lucide-react';
import type { RightPanelTab } from '@/types';

const TABS: { id: RightPanelTab; label: string; icon: React.ReactNode }[] = [
  { id: 'agentChat', label: 'Agent', icon: <MessageSquare className="w-4 h-4" /> },
  { id: 'chart', label: '图表', icon: <BarChart3 className="w-4 h-4" /> },
  { id: 'ahp', label: 'AHP', icon: <GitCompareArrows className="w-4 h-4" /> },
  { id: 'upload', label: '上传', icon: <Upload className="w-4 h-4" /> },
  { id: 'history', label: '历史', icon: <History className="w-4 h-4" /> },
  { id: 'guided', label: '分步', icon: <LayoutTemplate className="w-4 h-4" /> },
  { id: 'report', label: '报告', icon: <FileText className="w-4 h-4" /> },
  { id: 'interview', label: '采访', icon: <MessageCircleQuestion className="w-4 h-4" /> },
  { id: 'logs', label: '日志', icon: <TerminalSquare className="w-4 h-4" /> },
  { id: 'research', label: '研究', icon: <Search className="w-4 h-4" /> },
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

  // Collapsed mode: vertical icon bar on the right
  if (state.rightPanelCollapsed) {
    return (
      <motion.div
        initial={{ x: 50 }}
        animate={{ x: 0 }}
        className="w-12 bg-slate-800 border-l border-slate-700 flex flex-col items-center py-2 z-20 shrink-0"
      >
        <button
          onClick={() => dispatch({ type: 'TOGGLE_RIGHT_COLLAPSED', payload: false })}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-400 hover:bg-slate-700 mb-2 transition-colors"
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
                ? 'text-blue-400 bg-blue-500/15'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
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
        className="w-1 cursor-col-resize hover:bg-blue-400/50 active:bg-blue-400 transition-colors shrink-0 z-20"
        style={{ backgroundColor: 'transparent' }}
        title="拖拽调整宽度"
      />

      {/* Panel */}
      <motion.div
        initial={{ x: 100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ type: 'tween', duration: 0.3, ease: 'easeOut' }}
        className="bg-slate-800 border-l border-slate-700 flex flex-col overflow-hidden shrink-0"
        style={{ width: state.rightPanelWidth }}
      >
        {/* Tab Bar */}
        <div className="h-10 border-b border-slate-700 flex items-center px-1 gap-0.5 shrink-0">
          <button
            onClick={() => dispatch({ type: 'TOGGLE_RIGHT_COLLAPSED', payload: true })}
            className="w-7 h-7 rounded flex items-center justify-center text-slate-400 hover:text-blue-400 hover:bg-slate-700 mr-1 transition-colors"
            title="收起面板"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => dispatch({ type: 'SET_RIGHT_PANEL', payload: tab.id })}
              className={`flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition-all ${
                state.rightPanel === tab.id
                  ? 'text-blue-400 bg-blue-500/15'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={state.rightPanel}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="h-full"
            >
              {state.rightPanel === 'agentChat' && <AgentChat />}
              {state.rightPanel === 'chart' && <ChartPanel />}
              {state.rightPanel === 'ahp' && <AHPMatrix />}
              {state.rightPanel === 'upload' && <FileUploadPanel />}
              {state.rightPanel === 'history' && <HistoryPanel />}
              {state.rightPanel === 'guided' && <GuidedReport />}
              {state.rightPanel === 'report' && <ReportPanel />}
              {state.rightPanel === 'interview' && <InterviewPanel />}
              {state.rightPanel === 'logs' && <SystemLogPanel />}
              {state.rightPanel === 'research' && <DeepResearch />}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </>
  );
}
