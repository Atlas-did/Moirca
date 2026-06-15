import { useState, useMemo, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, StickyNote, TrendingUp, Search, RotateCcw, X, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, LayoutGrid, Table } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import ScoreInputBar from './ScoreInputBar';
import CardView from './CardView';
import { getRecommendations, type RecommendItem, type RecommendResponse } from '@/api/recommend';
import type { VolunteerRow } from '@/types';

const SUBJECT_TYPES = ['全部', '物理类', '历史类'];
const SUBJECT_REQS = ['物理', '化学', '生物', '历史', '政治', '地理'];
const CITIES = ['江西', '广东', '北京', '上海', '浙江', '江苏', '湖北', '湖南'];
const PAGE_SIZES = [10, 25, 50];

function recommendToVolunteerRow(r: RecommendItem, idx: number): VolunteerRow {
  return {
    id: `backend_${r.major_code}_${idx}`,
    schoolCode: r.major_code.slice(0, 4),
    schoolName: r.school || '推荐院校',
    batch: '本科批',
    subjectType: '物理类',
    planType: '普通类',
    groupCode: 'AI',
    groupName: '后端推荐组',
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

export default function VolunteerTable() {
  const { state, dispatch } = useApp();
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [showTrendModal, setShowTrendModal] = useState<string | null>(null);
  const [isLoadingRemote, setIsLoadingRemote] = useState(false);
  const [remoteError, setRemoteError] = useState('');
  const [reloadNonce, setReloadNonce] = useState(0);

  const ViewToggle = () => (
    <div className="flex items-center gap-0.5 ml-2">
      <button onClick={() => setViewMode('table')} className={`p-1 rounded ${viewMode === 'table' ? 'bg-blue-100 dark:bg-blue-900 text-blue-600' : 'text-slate-400'}`} title="表格视图"><Table className="w-3.5 h-3.5" /></button>
      <button onClick={() => setViewMode('card')} className={`p-1 rounded ${viewMode === 'card' ? 'bg-blue-100 dark:bg-blue-900 text-blue-600' : 'text-slate-400'}`} title="卡片视图"><LayoutGrid className="w-3.5 h-3.5" /></button>
    </div>
  );
  const [showNoteModal, setShowNoteModal] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState('');

  const fallbackProfile = state.homeInput || {
    score: '585',
    province: '广东',
    subject: '物理类',
    rank: '',
  };

  const profileSignature = useMemo(
    () => [
      String(state.recommendMeta?.profile?.score ?? fallbackProfile.score),
      String(state.recommendMeta?.profile?.province ?? fallbackProfile.province),
      String(state.recommendMeta?.profile?.auto_tier ?? ''),
      String(fallbackProfile.subject),
      String(fallbackProfile.rank ?? ''),
    ].join('|'),
    [state.recommendMeta?.profile, fallbackProfile.score, fallbackProfile.province, fallbackProfile.subject, fallbackProfile.rank],
  );

  useEffect(() => {
    let cancelled = false;
    const score = Number(state.recommendMeta?.profile?.score ?? fallbackProfile.score);
    const province = String(state.recommendMeta?.profile?.province ?? fallbackProfile.province);

    if (!score || Number.isNaN(score) || score < 100) return;

    setIsLoadingRemote(true);
    setRemoteError('');

    getRecommendations({
      score,
      province,
      keywords: [],
      top_n: 15,
    })
      .then((data: RecommendResponse) => {
        if (cancelled) return;
        const rows = data.recommendations.map((r, i) => recommendToVolunteerRow(r, i));
        dispatch({ type: 'LOAD_VOLUNTEER_DATA', payload: rows });
        setPage(1);
        dispatch({
          type: 'SET_RECOMMEND_META',
          payload: {
            profile: data.profile,
            tierSummary: data.tier_summary,
            warnings: data.warnings,
          },
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : '拉取后端推荐失败';
        setRemoteError(msg);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingRemote(false);
      });

    return () => {
      cancelled = true;
    };
  }, [dispatch, profileSignature, reloadNonce]);

  // Filter logic
  const filtered = useMemo(() => {
    return state.volunteerData.filter(row => {
      const f = state.filterCondition;
      if (f.schoolName && !row.schoolName.includes(f.schoolName)) return false;
      if (f.majorName && !row.majorName.includes(f.majorName)) return false;
      if (f.subjectType !== '全部' && row.subjectType !== f.subjectType) return false;
      return true;
    });
  }, [state.volunteerData, state.filterCondition]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentData = filtered.slice((page - 1) * pageSize, page * pageSize);

  // Group by school
  const grouped = useMemo(() => {
    const map = new Map<string, typeof currentData>();
    currentData.forEach(row => {
      const key = `${row.schoolCode}_${row.groupCode}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    });
    return map;
  }, [currentData]);

  const handleToggleStar = (id: string) => dispatch({ type: 'TOGGLE_STAR', payload: id });

  const handleOpenNote = (row: typeof currentData[0]) => {
    setShowNoteModal(row.id);
    setNoteInput(row.noteContent);
  };

  const handleSaveNote = () => {
    if (showNoteModal) {
      dispatch({ type: 'UPDATE_NOTE', payload: { id: showNoteModal, note: noteInput } });
      setShowNoteModal(null);
    }
  };

  // Active filters display
  const activeFilters: { key: string; label: string }[] = [];
  if (state.filterCondition.schoolName) activeFilters.push({ key: 'school', label: `院校: ${state.filterCondition.schoolName}` });
  if (state.filterCondition.majorName) activeFilters.push({ key: 'major', label: `专业: ${state.filterCondition.majorName}` });
  if (state.filterCondition.subjectType !== '全部') activeFilters.push({ key: 'subj', label: `科类: ${state.filterCondition.subjectType}` });

  const trendData = [
    { year: '2022', score: 580 },
    { year: '2023', score: 585 },
    { year: '2024', score: 590 },
  ];

  return (
    <div className="h-full flex flex-col bg-white">
      {/* AI Recommend Bar */}
      <ScoreInputBar />

      {/* Backend sync status */}
      {(isLoadingRemote || remoteError) && (
        <div className="px-4 py-2 text-xs border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-2">
          <span className="text-slate-500">
            {isLoadingRemote ? '正在从后端刷新志愿数据...' : `后端同步失败：${remoteError}`}
          </span>
          <button
            onClick={() => {
              setRemoteError('');
              setReloadNonce(v => v + 1);
            }}
            className="text-blue-600 hover:text-blue-500"
          >
            重新同步
          </button>
        </div>
      )}

      {/* Tier Summary + View Toggle */}
      {state.recommendMeta && (
        <div className="flex items-center gap-3 px-4 py-2 bg-blue-50/50 dark:bg-blue-950/30 border-b border-blue-100 dark:border-blue-900 text-xs">
          <span className="text-slate-500 dark:text-slate-400">冲稳保:</span>
          {(['冲','稳','保'] as const).map(t => {
            const info = state.recommendMeta?.tierSummary[t];
            return (
              <span key={t} className={`font-medium ${t === '冲' ? 'text-red-500' : t === '稳' ? 'text-blue-500' : 'text-green-500'}`}>
                {t} {info?.count ?? 0}
              </span>
            );
          })}
          <ViewToggle />
          {state.recommendMeta.warnings.length > 0 && (
            <span className="text-amber-600 dark:text-amber-400 ml-auto truncate" title={state.recommendMeta.warnings[0]}>
              ⚠ {state.recommendMeta.warnings[0]}
            </span>
          )}
        </div>
      )}

      {/* Card or Table view */}
      {viewMode === 'card' ? <CardView /> : (<>
      {/* existing table code follows */}

      {/* Filter Area */}
      <div className="border-b border-slate-200 p-4 space-y-3 shrink-0 overflow-y-auto" style={{ maxHeight: '35%' }}>
        {/* Row 1: Text inputs */}
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 whitespace-nowrap">院校名称</span>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                value={state.filterCondition.schoolName}
                onChange={e => dispatch({ type: 'SET_FILTER', payload: { schoolName: e.target.value } })}
                placeholder="搜索院校..."
                className="pl-7 pr-2 py-1.5 border border-slate-300 rounded-md text-xs w-36 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 whitespace-nowrap">专业名称</span>
            <input
              type="text"
              value={state.filterCondition.majorName}
              onChange={e => dispatch({ type: 'SET_FILTER', payload: { majorName: e.target.value } })}
              placeholder="搜索专业..."
              className="px-2 py-1.5 border border-slate-300 rounded-md text-xs w-36 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* Subject Type */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 whitespace-nowrap">科类</span>
          <div className="flex gap-1">
            {SUBJECT_TYPES.map(t => (
              <button
                key={t}
                onClick={() => dispatch({ type: 'SET_FILTER', payload: { subjectType: t } })}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                  state.filterCondition.subjectType === t
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Subject Requirements */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 whitespace-nowrap">选科要求</span>
          <div className="flex flex-wrap gap-1">
            {SUBJECT_REQS.map(s => (
              <button
                key={s}
                onClick={() => {
                  const reqs = state.filterCondition.subjectRequirements;
                  const newReqs = reqs.includes(s) ? reqs.filter(r => r !== s) : [...reqs, s];
                  dispatch({ type: 'SET_FILTER', payload: { subjectRequirements: newReqs } });
                }}
                className={`px-2.5 py-1 rounded-full text-xs transition-all ${
                  state.filterCondition.subjectRequirements.includes(s)
                    ? 'bg-green-500 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Cities */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 whitespace-nowrap">院校省市</span>
          <div className="flex flex-wrap gap-1">
            {CITIES.map(c => (
              <button
                key={c}
                onClick={() => {
                  const cities = state.filterCondition.cities;
                  const newCities = cities.includes(c) ? cities.filter(x => x !== c) : [...cities, c];
                  dispatch({ type: 'SET_FILTER', payload: { cities: newCities } });
                }}
                className={`px-2.5 py-1 rounded-full text-xs transition-all ${
                  state.filterCondition.cities.includes(c)
                    ? 'bg-orange-500 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Active Filters */}
        {activeFilters.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-slate-100">
            <span className="text-xs text-slate-400">已选条件:</span>
            {activeFilters.map(f => (
              <span key={f.key} className="flex items-center gap-1 bg-blue-50 text-blue-600 text-xs px-2 py-0.5 rounded-full">
                {f.label}
                <button
                  onClick={() => dispatch({ type: 'SET_FILTER', payload: { [f.key === 'school' ? 'schoolName' : f.key === 'major' ? 'majorName' : 'subjectType']: f.key === 'subj' ? '全部' : '' } })}
                  className="hover:text-blue-800"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <button
              onClick={() => dispatch({ type: 'SET_FILTER', payload: { schoolName: '', majorName: '', subjectType: '全部', subjectRequirements: [], cities: [] } })}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-500 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              重置
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-slate-600 border-b">院校代号</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600 border-b">院校名称</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600 border-b">批次</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600 border-b">科类</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600 border-b">专业组</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600 border-b">专业名称</th>
              <th className="px-3 py-2 text-center font-medium text-slate-600 border-b">计划</th>
              <th className="px-3 py-2 text-center font-medium text-slate-600 border-b">收费(元/年)</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600 border-b">备注</th>
              <th className="px-3 py-2 text-center font-medium text-slate-600 border-b">录取趋势</th>
              <th className="px-3 py-2 text-center font-medium text-slate-600 border-b">收藏</th>
            </tr>
          </thead>
          <tbody>
            {Array.from(grouped.entries()).map(([, rows]) => {
              const schoolRowSpan = rows.length;
              return rows.map((row, rowIdx) => (
                <motion.tr
                  key={row.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="hover:bg-blue-50/50 transition-colors border-b border-slate-100"
                >
                  {rowIdx === 0 && (
                    <>
                      <td className="px-3 py-2 text-slate-600 align-top" rowSpan={schoolRowSpan}>{row.schoolCode}</td>
                      <td className="px-3 py-2 font-medium text-slate-800 align-top" rowSpan={schoolRowSpan}>{row.schoolName}</td>
                      <td className="px-3 py-2 text-slate-500 align-top" rowSpan={schoolRowSpan}>{row.batch}</td>
                      <td className="px-3 py-2 text-slate-500 align-top" rowSpan={schoolRowSpan}>{row.subjectType}</td>
                    </>
                  )}
                  <td className="px-3 py-2 text-slate-500">{row.groupCode}:{row.groupName}</td>
                  <td className="px-3 py-2 font-medium text-slate-700">{row.majorName}</td>
                  <td className="px-3 py-2 text-center text-slate-600 font-mono">{row.planCount}</td>
                  <td className="px-3 py-2 text-center text-slate-600 font-mono">{row.fee.toLocaleString()}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      {row.remark && <span className="text-slate-400">{row.remark}</span>}
                      <button
                        onClick={() => handleOpenNote(row)}
                        className="relative p-0.5 hover:bg-slate-100 rounded transition-colors"
                      >
                        <StickyNote className="w-3.5 h-3.5 text-slate-400" />
                        {row.hasNote && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-blue-500 rounded-full" />}
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => setShowTrendModal(row.id)}
                      className="flex items-center gap-1 mx-auto text-blue-500 hover:text-blue-700 transition-colors"
                    >
                      <TrendingUp className="w-3.5 h-3.5" />
                      <span>查看</span>
                    </button>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => handleToggleStar(row.id)}
                      className="transition-colors"
                    >
                      <Star
                        className={`w-4.5 h-4.5 ${row.isStarred ? 'text-yellow-400 fill-yellow-400' : 'text-slate-300 hover:text-yellow-400'}`}
                      />
                    </button>
                  </td>
                </motion.tr>
              ));
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="h-11 border-t border-slate-200 flex items-center justify-between px-4 bg-white shrink-0">
        <div className="text-xs text-slate-500">
          共 <span className="font-medium">{filtered.length}</span> 条记录
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setPage(1)} disabled={page === 1} className="p-1 rounded hover:bg-slate-100 disabled:opacity-30">
            <ChevronsLeft className="w-3.5 h-3.5 text-slate-500" />
          </button>
          <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="p-1 rounded hover:bg-slate-100 disabled:opacity-30">
            <ChevronLeft className="w-3.5 h-3.5 text-slate-500" />
          </button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            const p = i + 1;
            return (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`w-7 h-7 rounded-md text-xs font-medium transition-all ${
                  page === p ? 'bg-blue-500 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {p}
              </button>
            );
          })}
          {totalPages > 5 && <span className="text-slate-400 px-1">...</span>}
          <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="p-1 rounded hover:bg-slate-100 disabled:opacity-30">
            <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
          </button>
          <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="p-1 rounded hover:bg-slate-100 disabled:opacity-30">
            <ChevronsRight className="w-3.5 h-3.5 text-slate-500" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={pageSize}
            onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
            className="text-xs border border-slate-300 rounded-md px-2 py-1 focus:outline-none focus:border-blue-500"
          >
            {PAGE_SIZES.map(s => <option key={s} value={s}>{s}条/页</option>)}
          </select>
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-500">前往</span>
            <input
              type="number"
              min={1}
              max={totalPages}
              onChange={e => {
                const p = parseInt(e.target.value);
                if (p >= 1 && p <= totalPages) setPage(p);
              }}
              className="w-10 text-center text-xs border border-slate-300 rounded-md py-1 focus:outline-none focus:border-blue-500"
            />
            <span className="text-xs text-slate-500">页</span>
          </div>
        </div>
      </div>

      {/* Trend Modal */}
      <AnimatePresence>
        {showTrendModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={() => setShowTrendModal(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-xl p-5 w-[420px] shadow-xl"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium text-slate-800">近年录取趋势</h3>
                <button onClick={() => setShowTrendModal(null)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="year" stroke="#94a3b8" fontSize={11} />
                  <YAxis stroke="#94a3b8" fontSize={11} domain={['dataMin - 10', 'dataMax + 10']} />
                  <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                  <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Note Modal */}
      <AnimatePresence>
        {showNoteModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={() => setShowNoteModal(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-xl p-5 w-[360px] shadow-xl"
            >
              <h3 className="font-medium text-slate-800 mb-3">编辑备注</h3>
              <textarea
                value={noteInput}
                onChange={e => setNoteInput(e.target.value)}
                rows={4}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 resize-none"
                placeholder="输入备注内容..."
              />
              <div className="flex justify-end gap-2 mt-3">
                <button
                  onClick={() => setShowNoteModal(null)}
                  className="px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 rounded-md transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleSaveNote}
                  className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
                >
                  保存
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
  </>)}</div>
  );
}
