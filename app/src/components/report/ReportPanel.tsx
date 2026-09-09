import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { FileText, RefreshCw, CalendarDays, Link as LinkIcon } from 'lucide-react';
import { getHistoryItems, type HistoryItem } from '@/api/history';
import { generateReport, getReport } from '@/api/report';
import MarkdownRenderer from './MarkdownRenderer';

export default function ReportPanel() {
  const { state, dispatch } = useApp();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);

  const reportItems = useMemo(() => items.filter(item => item.kind === 'report'), [items]);
  const activeReportId = state.activeReportId || reportItems[0]?.id || '';

  const loadHistory = async () => {
    try {
      const history = await getHistoryItems(80);
      setItems(history.items);
      setError('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '加载报告列表失败');
    }
  };

  useEffect(() => {
    let mounted = true;
    const initialTimer = window.setTimeout(() => {
      if (mounted) loadHistory();
    }, 0);
    const timer = window.setInterval(() => {
      if (mounted) loadHistory();
    }, 10000);
    return () => {
      mounted = false;
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!activeReportId) return;
    let mounted = true;
    getReport(activeReportId)
      .then((data) => {
        if (!mounted) return;
        setContent(data.content_md);
      })
      .catch((e: unknown) => {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : '加载报告失败');
        setContent('');
      });
    return () => {
      mounted = false;
    };
  }, [activeReportId]);

  const selectedItem = reportItems.find(item => item.id === activeReportId);

  const handleGenerateCurrent = async () => {
    if (!state.recommendMeta) {
      setError('请先生成推荐结果，再生成报告');
      return;
    }
    setGenerating(true);
    setError('');
    try {
      const generated = await generateReport({
        profile: {
          ...state.recommendMeta.profile,
          active_document_id: state.activeDocumentId,
          selected_school_id: state.selectedSchoolId,
        },
        recommendations: {
          recommendations: state.volunteerData.slice(0, 15).map((row) => ({
            profession_name: row.majorName,
            strategy: row.isStarred ? '保' : '稳',
            match_score: row.planCount || 0,
            reason: row.remark,
          })),
          warnings: state.recommendMeta.warnings,
        },
        document_ids: state.activeDocumentId ? [state.activeDocumentId] : [],
        report_context: {
          active_document_id: state.activeDocumentId,
          active_report_id: state.activeReportId,
          selected_school_id: state.selectedSchoolId,
        },
      });
      await loadHistory();
      dispatch({ type: 'SET_ACTIVE_REPORT', payload: generated.report_id });
      setContent(generated.content_md);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '生成报告失败');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="h-10 shrink-0 px-3 border-b border-border flex items-center justify-between bg-card">
        <div className="flex items-center gap-2 text-foreground">
          <FileText className="w-4 h-4 text-muted-foreground" />
          <span className="text-[13px] font-medium">报告 Markdown 渲染</span>
        </div>
        <button
          onClick={() => {
            loadHistory();
            dispatch({ type: 'SET_ACTIVE_REPORT', payload: reportItems[0]?.id || null });
          }}
          className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"
        >
          <RefreshCw className="w-3 h-3" />
          刷新
        </button>
      </div>

      <div className="px-3 py-2 bg-card border-b border-border flex items-center gap-2">
        <button
          onClick={handleGenerateCurrent}
          disabled={generating}
          className="text-xs px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 shadow-xs flex items-center gap-1"
        >
          {generating ? <RefreshCw className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
          生成当前报告
        </button>
        <div className="text-[11px] text-muted-foreground truncate">
          绑定文档：{state.activeDocumentId || '无'} · 推荐：{state.recommendMeta ? '已就绪' : '未生成'}
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-[220px_1fr]">
        <div className="border-r border-border bg-card overflow-y-auto thin-scrollbar">
          <div className="eyebrow flex items-center gap-1 px-3 pt-3 pb-2">
            <CalendarDays className="w-3 h-3" />
            历史报告
          </div>
          <div className="px-2 pb-3">
            {reportItems.length === 0 && (
              <div className="px-3 py-4 text-xs text-muted-foreground">暂无报告</div>
            )}
            {reportItems.map(item => (
              <button
                key={item.id}
                onClick={() => dispatch({ type: 'SET_ACTIVE_REPORT', payload: item.id })}
                className={`w-full border-l-2 px-2 py-1.5 text-left transition-colors duration-150 ${
                  item.id === activeReportId
                    ? 'border-primary bg-accent/40'
                    : 'border-transparent hover:bg-accent/60'
                }`}
              >
                <div className={`text-xs truncate ${item.id === activeReportId ? 'font-medium text-primary' : 'text-foreground'}`}>{item.title}</div>
                <div className="text-[11px] text-muted-foreground truncate tabular-nums">{item.id}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-y-auto thin-scrollbar px-4 py-4">
          {selectedItem && (
            <div className="mb-4 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
              <div className="mb-1.5 flex items-center gap-2 text-[13px] font-medium text-foreground">
                <LinkIcon className="w-3.5 h-3.5 text-muted-foreground" />
                当前报告上下文
              </div>
              <div className="tabular-nums">报告 ID：{selectedItem.id}</div>
              <div className="tabular-nums">更新时间：{String(selectedItem.updated_at || '')}</div>
              <div>来源：历史列表 / Markdown 文件</div>
            </div>
          )}

          {error && <div className="mb-3 text-xs text-destructive">{error}</div>}
          {activeReportId && !content && <div className="text-xs text-muted-foreground mb-3">正在加载报告...</div>}

          {/* 文章直排:bg-background 上裸排(唯一一屏按「文章」排,不再包卡片) */}
          {selectedItem && content ? (
            <MarkdownRenderer markdown={content} />
          ) : (
            <div className="flex h-40 items-center justify-center text-[13px] text-muted-foreground">请选择左侧报告以查看渲染结果。</div>
          )}
        </div>
      </div>
    </div>
  );
}
