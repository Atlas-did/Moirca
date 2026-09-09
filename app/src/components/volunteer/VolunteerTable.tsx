import { useState, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, StickyNote, TrendingUp, Search, RotateCcw, X, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, LayoutGrid, Table, AlertTriangle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import ScoreInputBar from './ScoreInputBar';
import CardView from './CardView';

const SUBJECT_TYPES = ['全部', '物理类', '历史类'];
const SUBJECT_REQS = ['物理', '化学', '生物', '历史', '政治', '地理'];
const CITIES = ['江西', '广东', '北京', '上海', '浙江', '江苏', '湖北', '湖南'];
const PAGE_SIZES = [10, 25, 50];

export default function VolunteerTable() {
  const { state, dispatch } = useApp();
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [showTrendModal, setShowTrendModal] = useState<string | null>(null);

  const ViewToggle = () => (
    <div className="flex items-center gap-0.5 ml-2">
      <button onClick={() => setViewMode('table')} className={`p-1 rounded-md transition-colors duration-150 ${viewMode === 'table' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-accent'}`} title="表格视图"><Table className="w-3.5 h-3.5" /></button>
      <button onClick={() => setViewMode('card')} className={`p-1 rounded-md transition-colors duration-150 ${viewMode === 'card' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-accent'}`} title="卡片视图"><LayoutGrid className="w-3.5 h-3.5" /></button>
    </div>
  );
  const [showNoteModal, setShowNoteModal] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState('');

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
    <div className="h-full flex flex-col bg-background">
      {/* AI Recommend Bar */}
      <ScoreInputBar />

      {/* Tier Summary + View Toggle */}
      {state.recommendMeta && (
        <div className="flex items-center gap-3 px-4 py-2 bg-muted/40 border-b border-border text-xs">
          <span className="text-muted-foreground">冲稳保:</span>
          {(['冲','稳','保'] as const).map(t => {
            const info = state.recommendMeta?.tierSummary[t];
            const badge = t === '冲'
              ? 'border-destructive/40 bg-destructive/10 text-destructive'
              : t === '稳'
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-[hsl(var(--success)/0.4)] bg-[hsl(var(--success)/0.1)] text-[hsl(var(--success))]';
            return (
              <span key={t} className={`inline-flex items-center gap-1 border rounded-sm px-1.5 py-0.5 font-medium tabular-nums ${badge}`}>
                {t} {info?.count ?? 0}
              </span>
            );
          })}
          <ViewToggle />
          {state.recommendMeta.warnings.length > 0 && (
            <span className="inline-flex items-center gap-1 text-[hsl(var(--warning))] ml-auto truncate" title={state.recommendMeta.warnings[0]}>
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {state.recommendMeta.warnings[0]}
            </span>
          )}
        </div>
      )}

      {/* Card or Table view */}
      {viewMode === 'card' ? <CardView /> : (<>
      {/* existing table code follows */}

      {/* Filter Area */}
      <div className="border-b border-border p-4 space-y-3 shrink-0 overflow-y-auto thin-scrollbar" style={{ maxHeight: '35%' }}>
        {/* Row 1: Text inputs */}
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground whitespace-nowrap">院校名称</span>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/70" />
              <input
                type="text"
                value={state.filterCondition.schoolName}
                onChange={e => dispatch({ type: 'SET_FILTER', payload: { schoolName: e.target.value } })}
                placeholder="搜索院校..."
                className="pl-7 pr-2 py-1.5 border border-input bg-card text-foreground placeholder:text-muted-foreground/70 rounded-md text-xs w-36 focus:outline-none focus:ring-2 focus:ring-ring/30 transition-colors"
              />
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground whitespace-nowrap">专业名称</span>
            <input
              type="text"
              value={state.filterCondition.majorName}
              onChange={e => dispatch({ type: 'SET_FILTER', payload: { majorName: e.target.value } })}
              placeholder="搜索专业..."
              className="px-2 py-1.5 border border-input bg-card text-foreground placeholder:text-muted-foreground/70 rounded-md text-xs w-36 focus:outline-none focus:ring-2 focus:ring-ring/30 transition-colors"
            />
          </div>
        </div>

        {/* Subject Type */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">科类</span>
          <div className="flex gap-1">
            {SUBJECT_TYPES.map(t => (
              <button
                key={t}
                onClick={() => dispatch({ type: 'SET_FILTER', payload: { subjectType: t } })}
                className={`px-3 py-1 rounded-sm text-xs transition-colors duration-150 ${
                  state.filterCondition.subjectType === t
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-transparent border border-border text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Subject Requirements */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">选科要求</span>
          <div className="flex flex-wrap gap-1">
            {SUBJECT_REQS.map(s => (
              <button
                key={s}
                onClick={() => {
                  const reqs = state.filterCondition.subjectRequirements;
                  const newReqs = reqs.includes(s) ? reqs.filter(r => r !== s) : [...reqs, s];
                  dispatch({ type: 'SET_FILTER', payload: { subjectRequirements: newReqs } });
                }}
                className={`px-2.5 py-1 rounded-sm text-xs transition-colors duration-150 ${
                  state.filterCondition.subjectRequirements.includes(s)
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-transparent border border-border text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Cities */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">院校省市</span>
          <div className="flex flex-wrap gap-1">
            {CITIES.map(c => (
              <button
                key={c}
                onClick={() => {
                  const cities = state.filterCondition.cities;
                  const newCities = cities.includes(c) ? cities.filter(x => x !== c) : [...cities, c];
                  dispatch({ type: 'SET_FILTER', payload: { cities: newCities } });
                }}
                className={`px-2.5 py-1 rounded-sm text-xs transition-colors duration-150 ${
                  state.filterCondition.cities.includes(c)
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-transparent border border-border text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Active Filters */}
        {activeFilters.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-border/60">
            <span className="text-xs text-muted-foreground">已选条件:</span>
            {activeFilters.map(f => (
              <span key={f.key} className="flex items-center gap-1 bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-sm">
                {f.label}
                <button
                  onClick={() => dispatch({ type: 'SET_FILTER', payload: { [f.key === 'school' ? 'schoolName' : f.key === 'major' ? 'majorName' : 'subjectType']: f.key === 'subj' ? '全部' : '' } })}
                  className="hover:text-primary/70 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <button
              onClick={() => dispatch({ type: 'SET_FILTER', payload: { schoolName: '', majorName: '', subjectType: '全部', subjectRequirements: [], cities: [] } })}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              重置
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto thin-scrollbar">
        <table className="w-full text-[13px]">
          <thead className="bg-muted/60 sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2.5 whitespace-nowrap text-left text-xs font-medium text-muted-foreground tracking-wide border-b border-border">院校代号</th>
              <th className="px-3 py-2.5 whitespace-nowrap text-left text-xs font-medium text-muted-foreground tracking-wide border-b border-border">院校名称</th>
              <th className="px-3 py-2.5 whitespace-nowrap text-left text-xs font-medium text-muted-foreground tracking-wide border-b border-border">批次</th>
              <th className="px-3 py-2.5 whitespace-nowrap text-left text-xs font-medium text-muted-foreground tracking-wide border-b border-border">科类</th>
              <th className="px-3 py-2.5 whitespace-nowrap text-left text-xs font-medium text-muted-foreground tracking-wide border-b border-border">专业组</th>
              <th className="px-3 py-2.5 whitespace-nowrap text-left text-xs font-medium text-muted-foreground tracking-wide border-b border-border">专业名称</th>
              <th className="px-3 py-2.5 whitespace-nowrap text-right text-xs font-medium text-muted-foreground tracking-wide border-b border-border">计划</th>
              <th className="px-3 py-2.5 whitespace-nowrap text-right text-xs font-medium text-muted-foreground tracking-wide border-b border-border">收费(元/年)</th>
              <th className="px-3 py-2.5 whitespace-nowrap text-left text-xs font-medium text-muted-foreground tracking-wide border-b border-border">备注</th>
              <th className="px-3 py-2.5 whitespace-nowrap text-center text-xs font-medium text-muted-foreground tracking-wide border-b border-border">录取趋势</th>
              <th className="px-3 py-2.5 whitespace-nowrap text-center text-xs font-medium text-muted-foreground tracking-wide border-b border-border">收藏</th>
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
                  className="odd:bg-muted/30 hover:bg-accent/50 transition-colors duration-150 border-b border-border/60 h-10"
                >
                  {rowIdx === 0 && (
                    <>
                      <td className="px-3 py-2 text-muted-foreground tabular-nums align-top" rowSpan={schoolRowSpan}>{row.schoolCode}</td>
                      <td className="px-3 py-2 font-medium text-foreground align-top" rowSpan={schoolRowSpan}>{row.schoolName}</td>
                      <td className="px-3 py-2 text-muted-foreground align-top" rowSpan={schoolRowSpan}>{row.batch}</td>
                      <td className="px-3 py-2 text-muted-foreground align-top" rowSpan={schoolRowSpan}>{row.subjectType}</td>
                    </>
                  )}
                  <td className="px-3 py-2 text-muted-foreground">{row.groupCode}:{row.groupName}</td>
                  <td className="px-3 py-2 font-medium text-foreground">{row.majorName}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-foreground">{row.planCount}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-foreground">{row.fee.toLocaleString()}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      {row.remark && <span className="text-muted-foreground">{row.remark}</span>}
                      <button
                        onClick={() => handleOpenNote(row)}
                        className="relative p-0.5 hover:bg-accent rounded-md transition-colors duration-150"
                      >
                        <StickyNote className="w-3.5 h-3.5 text-muted-foreground" />
                        {row.hasNote && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-primary rounded-full" />}
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => setShowTrendModal(row.id)}
                      className="inline-flex items-center gap-1 text-primary hover:text-primary/80 transition-colors duration-150"
                    >
                      <TrendingUp className="w-3.5 h-3.5" />
                      <span>查看</span>
                    </button>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => handleToggleStar(row.id)}
                      className="p-0.5 rounded-md transition-colors duration-150"
                    >
                      <Star
                        className={`w-4 h-4 ${row.isStarred ? 'text-[hsl(var(--chart-5))] fill-[hsl(var(--chart-5))]' : 'text-muted-foreground/40 hover:text-[hsl(var(--chart-5))]'}`}
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
      <div className="h-11 border-t border-border flex items-center justify-between px-4 bg-card shrink-0">
        <div className="text-xs text-muted-foreground">
          共 <span className="font-medium text-foreground tabular-nums">{filtered.length}</span> 条记录
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setPage(1)} disabled={page === 1} className="p-1 rounded-md hover:bg-accent disabled:opacity-30 transition-colors duration-150">
            <ChevronsLeft className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="p-1 rounded-md hover:bg-accent disabled:opacity-30 transition-colors duration-150">
            <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            const p = i + 1;
            return (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`w-7 h-7 rounded-md text-xs font-medium tabular-nums transition-colors duration-150 ${
                  page === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                {p}
              </button>
            );
          })}
          {totalPages > 5 && <span className="text-muted-foreground px-1">...</span>}
          <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="p-1 rounded-md hover:bg-accent disabled:opacity-30 transition-colors duration-150">
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="p-1 rounded-md hover:bg-accent disabled:opacity-30 transition-colors duration-150">
            <ChevronsRight className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={pageSize}
            onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
            className="text-xs border border-input bg-card text-foreground rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-ring/30 transition-colors"
          >
            {PAGE_SIZES.map(s => <option key={s} value={s}>{s}条/页</option>)}
          </select>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">前往</span>
            <input
              type="number"
              min={1}
              max={totalPages}
              onChange={e => {
                const p = parseInt(e.target.value);
                if (p >= 1 && p <= totalPages) setPage(p);
              }}
              className="w-10 text-center tabular-nums text-xs border border-input bg-card text-foreground rounded-md py-1 focus:outline-none focus:ring-2 focus:ring-ring/30 transition-colors"
            />
            <span className="text-xs text-muted-foreground">页</span>
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
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              onClick={e => e.stopPropagation()}
              className="bg-card border border-border rounded-lg p-5 w-[420px] shadow-md"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-foreground">近年录取趋势</h3>
                <button onClick={() => setShowTrendModal(null)} className="text-muted-foreground hover:text-foreground transition-colors duration-150">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="year" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} domain={['dataMin - 10', 'dataMax + 10']} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', color: 'hsl(var(--popover-foreground))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
                  <Line type="monotone" dataKey="score" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={{ fill: 'hsl(var(--chart-1))', r: 4 }} />
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
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              onClick={e => e.stopPropagation()}
              className="bg-card border border-border rounded-lg p-5 w-[360px] shadow-md"
            >
              <h3 className="text-sm font-semibold text-foreground mb-3">编辑备注</h3>
              <textarea
                value={noteInput}
                onChange={e => setNoteInput(e.target.value)}
                rows={4}
                className="w-full border border-input bg-card text-foreground placeholder:text-muted-foreground rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 resize-none transition-colors"
                placeholder="输入备注内容..."
              />
              <div className="flex justify-end gap-2 mt-3">
                <button
                  onClick={() => setShowNoteModal(null)}
                  className="px-3 h-8 text-xs text-muted-foreground hover:bg-accent hover:text-foreground rounded-md transition-colors duration-150"
                >
                  取消
                </button>
                <button
                  onClick={handleSaveNote}
                  className="px-3 h-8 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors duration-150 shadow-xs"
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
