import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { motion } from 'framer-motion';
import { History, FileText, GitBranch, Sparkles, PlaySquare, RefreshCw, ExternalLink } from 'lucide-react';
import { getHistoryItems, type HistoryItem } from '@/api/history';
import type { RecommendResponse } from '@/api/recommend';
import type { VolunteerRow } from '@/types';

type RecommendRow = RecommendResponse['recommendations'][number];

function recommendToVolunteerRow(r: RecommendRow, idx: number): VolunteerRow {
  return {
    id: `history_${r.major_code}_${idx}`,
    schoolCode: r.major_code.slice(0, 4),
    schoolName: r.school || '推荐院校',
    batch: '本科批',
    subjectType: '物理类',
    planType: '普通类',
    groupCode: 'AI',
    groupName: '历史推荐组',
    majorCode: r.major_code,
    majorName: r.major,
    planCount: 0,
    fee: 0,
    remark: `${r.reason} | 置信度 ${(r.confidence * 100).toFixed(0)}%`,
    admissionTrend: Array(3).fill(Math.round(r.match_score)),
    isStarred: r.tier === '保',
    hasNote: !!r.risk_note,
    noteContent: r.risk_note || '',
  };
}

export default function HistoryPanel() {
  const { dispatch } = useApp();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [filter, setFilter] = useState<'all' | HistoryItem['kind']>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getHistoryItems(100);
      setItems(res.items);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '加载历史失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 10000);
    return () => window.clearInterval(timer);
  }, []);

  const filtered = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter(item => item.kind === filter);
  }, [items, filter]);

  const openItem = (item: HistoryItem) => {
    if (item.kind === 'report') {
      dispatch({ type: 'SET_ACTIVE_REPORT', payload: item.id });
      dispatch({ type: 'SET_RIGHT_PANEL', payload: 'report' });
      return;
    }

    if (item.kind === 'upload') {
      const docId = item.id;
      dispatch({ type: 'SET_ACTIVE_DOCUMENT', payload: docId });
      dispatch({ type: 'SET_RIGHT_PANEL', payload: 'upload' });
      dispatch({ type: 'SET_LEFT_NAV', payload: 'graph' });
      return;
    }

    if (item.kind === 'recommendation' && item.result) {
      const result = item.result as unknown as RecommendResponse;
      const rows = result.recommendations.map((r, i) => recommendToVolunteerRow(r, i));
      dispatch({ type: 'LOAD_VOLUNTEER_DATA', payload: rows });
      dispatch({
        type: 'SET_RECOMMEND_META',
        payload: {
          profile: result.profile,
          tierSummary: result.tier_summary,
          warnings: result.warnings,
        },
      });
      dispatch({ type: 'SET_LEFT_NAV', payload: 'volunteer' });
      return;
    }

    if (item.kind === 'simulation') {
      dispatch({ type: 'SET_RIGHT_PANEL', payload: 'research' });
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="h-10 shrink-0 px-3 border-b border-slate-200 flex items-center justify-between bg-white">
        <div className="flex items-center gap-2 text-slate-700">
          <History className="w-4 h-4 text-blue-500" />
          <span className="text-sm font-medium">历史项目列表</span>
        </div>
        <button onClick={load} className="text-xs text-blue-600 hover:text-blue-500 flex items-center gap-1">
          <RefreshCw className="w-3 h-3" />
          刷新
        </button>
      </div>

      <div className="p-3 border-b border-slate-200 bg-white flex flex-wrap gap-2 text-xs">
        {(['all', 'recommendation', 'report', 'upload', 'simulation'] as const).map(key => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-2.5 py-1 rounded-full transition-colors ${filter === key ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            {key === 'all' ? '全部' : key}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading && <div className="text-xs text-slate-500">加载历史中...</div>}
        {error && <div className="text-xs text-red-500">{error}</div>}
        {filtered.length === 0 && !loading && <div className="text-xs text-slate-400">暂无历史记录</div>}
        {filtered.map(item => (
          <motion.button
            key={`${item.kind}:${item.id}`}
            whileHover={{ scale: 1.01 }}
            onClick={() => openItem(item)}
            className="w-full text-left bg-white border border-slate-200 rounded-xl p-3 hover:border-blue-300 transition-colors"
          >
            <div className="flex items-center gap-2 mb-1">
              {item.kind === 'recommendation' && <Sparkles className="w-4 h-4 text-purple-500" />}
              {item.kind === 'report' && <FileText className="w-4 h-4 text-blue-500" />}
              {item.kind === 'upload' && <GitBranch className="w-4 h-4 text-emerald-500" />}
              {item.kind === 'simulation' && <PlaySquare className="w-4 h-4 text-orange-500" />}
              <div className="text-sm font-medium text-slate-800 truncate flex-1">{item.title}</div>
              <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <div className="text-xs text-slate-500 truncate">{item.subtitle}</div>
            <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
              <span>{item.kind}</span>
              <span>{String(item.updated_at || '')}</span>
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
