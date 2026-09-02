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
    <div className="h-full flex flex-col bg-slate-50">
      <div className="h-10 shrink-0 px-3 border-b border-slate-200 flex items-center justify-between bg-white">
        <div className="flex items-center gap-2 text-slate-700">
          <FileText className="w-4 h-4 text-blue-500" />
          <span className="text-sm font-medium">报告 Markdown 渲染</span>
        </div>
        <button
          onClick={() => {
            loadHistory();
            dispatch({ type: 'SET_ACTIVE_REPORT', payload: reportItems[0]?.id || null });
          }}
          className="text-xs text-blue-600 hover:text-blue-500 flex items-center gap-1"
        >
          <RefreshCw className="w-3 h-3" />
          刷新
        </button>
      </div>

      <div className="px-3 py-2 bg-white border-b border-slate-200 flex items-center gap-2">
        <button
          onClick={handleGenerateCurrent}
          disabled={generating}
          className="text-xs px-2.5 py-1.5 rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 flex items-center gap-1"
        >
          {generating ? <RefreshCw className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
          生成当前报告
        </button>
        <div className="text-[10px] text-slate-500 truncate">
          绑定文档：{state.activeDocumentId || '无'} · 推荐：{state.recommendMeta ? '已就绪' : '未生成'}
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-[220px_1fr]">
        <div className="border-r border-slate-200 bg-white overflow-y-auto">
          <div className="p-3 text-xs text-slate-500 flex items-center gap-1">
            <CalendarDays className="w-3 h-3" />
            历史报告
          </div>
          <div className="space-y-2 px-2 pb-3">
            {reportItems.length === 0 && (
              <div className="px-3 py-4 text-xs text-slate-400">暂无报告</div>
            )}
            {reportItems.map(item => (
              <button
                key={item.id}
                onClick={() => dispatch({ type: 'SET_ACTIVE_REPORT', payload: item.id })}
                className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                  item.id === activeReportId ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="text-xs font-medium text-slate-800 truncate">{item.title}</div>
                <div className="text-[10px] text-slate-500 truncate">{item.id}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-y-auto p-4">
          {selectedItem && (
            <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
              <div className="flex items-center gap-2 mb-1 text-slate-700 font-medium">
                <LinkIcon className="w-3.5 h-3.5" />
                当前报告上下文
              </div>
              <div>报告 ID：{selectedItem.id}</div>
              <div>更新时间：{String(selectedItem.updated_at || '')}</div>
              <div>来源：历史列表 / Markdown 文件</div>
            </div>
          )}

          {error && <div className="mb-3 text-xs text-red-500">{error}</div>}
          {activeReportId && !content && <div className="text-xs text-slate-500 mb-3">正在加载报告...</div>}

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            {selectedItem && content ? <MarkdownRenderer markdown={content} /> : <div className="text-sm text-slate-400">请选择左侧报告以查看渲染结果。</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
