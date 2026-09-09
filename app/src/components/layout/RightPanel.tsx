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
  { id: 'agentChat', label: 'Agent', icon: <MessageSquare className="w-[18px] h-[18px]" /> },
  { id: 'chart', label: '图表', icon: <BarChart3 className="w-[18px] h-[18px]" /> },
  { id: 'ahp', label: 'AHP', icon: <GitCompareArrows className="w-[18px] h-[18px]" /> },
  { id: 'upload', label: '上传', icon: <Upload className="w-[18px] h-[18px]" /> },
  { id: 'history', label: '历史', icon: <History className="w-[18px] h-[18px]" /> },
  { id: 'guided', label: '分步', icon: <LayoutTemplate className="w-[18px] h-[18px]" /> },
  { id: 'report', label: '报告', icon: <FileText className="w-[18px] h-[18px]" /> },
  { id: 'interview', label: '采访', icon: <MessageCircleQuestion className="w-[18px] h-[18px]" /> },
  { id: 'logs', label: '日志', icon: <TerminalSquare className="w-[18px] h-[18px]" /> },
  { id: 'research', label: '研究', icon: <Search className="w-[18px] h-[18px]" /> },
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
        className="w-10 bg-card border-l border-border flex flex-col items-center py-2 z-20 shrink-0"
      >
        <button
          onClick={() => dispatch({ type: 'TOGGLE_RIGHT_COLLAPSED', payload: false })}
          className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent mb-2 transition-colors duration-150"
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
            className={`relative w-8 h-8 rounded-md flex items-center justify-center mb-1 transition-colors duration-150 ${
              state.rightPanel === tab.id
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
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
        className="w-1 cursor-col-resize bg-transparent hover:bg-primary/25 active:bg-primary/40 transition-colors duration-150 shrink-0 z-20"
        title="拖拽调整宽度"
      />

      {/* Panel */}
      <motion.div
        initial={{ x: 100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ type: 'tween', duration: 0.3, ease: 'easeOut' }}
        className="bg-card border-l border-border flex flex-col overflow-hidden shrink-0"
        style={{ width: state.rightPanelWidth }}
      >
        {/* Tab Bar: icon-only buttons + native tooltip + 2px underline indicator */}
        <div className="h-11 border-b border-border bg-card flex items-center px-2 gap-1 overflow-x-auto scrollbar-none whitespace-nowrap shrink-0">
          <button
            onClick={() => dispatch({ type: 'TOGGLE_RIGHT_COLLAPSED', payload: true })}
            className="w-8 h-8 rounded-md shrink-0 grid place-items-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors duration-150 mr-0.5"
            title="收起面板"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          {TABS.map((tab) => {
            const isActive = state.rightPanel === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => dispatch({ type: 'SET_RIGHT_PANEL', payload: tab.id })}
                className={`relative w-9 h-9 rounded-md shrink-0 whitespace-nowrap grid place-items-center transition-colors duration-150 ${
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
                title={tab.label}
              >
                {tab.icon}
                {isActive && (
                  <motion.div
                    layoutId="rightPanelTabActive"
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-0.5 w-5 rounded-sm bg-primary"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={state.rightPanel}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
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
