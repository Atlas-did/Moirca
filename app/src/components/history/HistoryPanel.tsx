import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { motion } from 'framer-motion';
import { History, FileText, GitBranch, Target, PlaySquare, RefreshCw, ExternalLink } from 'lucide-react';
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
    <div className="h-full flex flex-col bg-background">
      <div className="h-10 shrink-0 px-3 border-b border-border flex items-center justify-between bg-card">
        <div className="flex items-center gap-2 text-foreground">
          <History className="w-4 h-4 text-primary" />
          <span className="text-[13px] font-medium">历史项目列表</span>
        </div>
        <button onClick={load} className="text-xs text-primary hover:text-primary/80 flex items-center gap-1">
          <RefreshCw className="w-3 h-3" />
          刷新
        </button>
      </div>

      <div className="p-3 border-b border-border bg-card flex flex-wrap gap-1.5 text-xs">
        {(['all', 'recommendation', 'report', 'upload', 'simulation'] as const).map(key => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-2.5 py-1 rounded-sm transition-colors duration-150 ${filter === key ? 'bg-primary text-primary-foreground shadow-xs' : 'bg-transparent border border-border text-muted-foreground hover:bg-accent hover:text-foreground'}`}
          >
            {key === 'all' ? '全部' : key}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto thin-scrollbar px-3 py-2">
        {loading && <div className="text-xs text-muted-foreground">加载历史中...</div>}
        {error && <div className="text-xs text-destructive">{error}</div>}
        {filtered.length === 0 && !loading && (
          <div className="py-10 flex flex-col items-center gap-2 text-muted-foreground">
            <History className="w-8 h-8 text-muted-foreground/40" />
            <span className="text-xs">暂无历史记录</span>
          </div>
        )}
        <div className="divide-y divide-border">
        {filtered.map(item => (
          <motion.button
            key={`${item.kind}:${item.id}`}
            onClick={() => openItem(item)}
            className="w-full text-left px-2 py-2.5 rounded-sm hover:bg-accent/60 transition-colors duration-150"
          >
            <div className="flex items-center gap-2">
              {item.kind === 'recommendation' && <Target className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
              {item.kind === 'report' && <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
              {item.kind === 'upload' && <GitBranch className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
              {item.kind === 'simulation' && <PlaySquare className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
              <div className="text-[13px] font-medium text-foreground truncate flex-1">{item.title}</div>
              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground truncate">{item.subtitle}</div>
            <div className="mt-1.5 flex items-center justify-between">
              <span className="bg-primary/10 text-primary rounded-sm px-1.5 py-0.5 text-[11px]">{item.kind}</span>
              <span className="text-[11px] tabular-nums text-muted-foreground">{String(item.updated_at || '')}</span>
            </div>
          </motion.button>
        ))}
        </div>
      </div>
    </div>
  );
}
