import { useState, useRef, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, Target, School, AlertTriangle, CheckCircle2,
  ChevronRight, User, Sparkles, GripVertical, Loader2, MapPin,
} from 'lucide-react';

const SECTION_ICONS: Record<string, React.ReactNode> = {
  direction: <Target className="w-3.5 h-3.5" />,
  school: <School className="w-3.5 h-3.5" />,
  major: <Sparkles className="w-3.5 h-3.5" />,
  warning: <AlertTriangle className="w-3.5 h-3.5" />,
  decision: <CheckCircle2 className="w-3.5 h-3.5" />,
};

const SECTION_COLORS: Record<string, string> = {
  direction: 'border-l-amber-400 bg-amber-50/50',
  school: 'border-l-blue-400 bg-blue-50/50',
  major: 'border-l-purple-400 bg-purple-50/50',
  warning: 'border-l-red-400 bg-red-50/50',
  decision: 'border-l-emerald-400 bg-emerald-50/50',
};

const SECTION_LABELS: Record<string, string> = {
  direction: '推荐方向',
  school: '推荐院校',
  major: '推荐专业',
  warning: '风险提示',
  decision: '决策记录',
};

export default function DraftPanel() {
  const { state } = useApp();
  const cp = (state as any).customPhase as string;
  const isActive = cp && cp !== 'idle';
  const dp = state.draftPlan;
  const hasContent = dp.profile.score || dp.answers.length > 0 || dp.entries.length > 0 || !!dp.summary;

  const resizeRef = useRef<{ startX: number; startW: number } | null>(null);
  const [panelWidth, setPanelWidth] = useState(340);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      const dx = e.clientX - resizeRef.current.startX;
      setPanelWidth(Math.max(260, Math.min(600, resizeRef.current.startW + dx)));
    };
    const onUp = () => { resizeRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  if (!isActive && !hasContent) return null;

  const grouped = dp.entries.reduce<Record<string, typeof dp.entries>>((acc, e) => {
    (acc[e.type] ??= []).push(e);
    return acc;
  }, {});

  const sectionOrder = ['direction', 'school', 'major', 'warning', 'decision'];
  const summary = dp.summary;
  const showSummary = summary?.generated;

  return (
    <div className="flex shrink-0 h-full">
      <div
        className="w-[6px] cursor-col-resize hover:bg-emerald-400 active:bg-emerald-500 transition-colors shrink-0 flex items-center justify-center group bg-stone-100 border-l border-stone-200"
        onMouseDown={(e) => {
          resizeRef.current = { startX: e.clientX, startW: panelWidth };
          e.preventDefault();
        }}
      >
        <GripVertical className="w-3 h-3 text-stone-400 group-hover:text-white opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        className="flex flex-col bg-white border-l border-stone-200 h-full"
        style={{ width: panelWidth }}
      >
        <div className="px-5 py-3.5 border-b border-stone-100 bg-white flex items-center gap-2.5 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center">
            <FileText className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-sm font-bold text-stone-800">拟定方案</div>
            <div className="text-[10px] text-stone-400">
              {showSummary ? 'LLM 智能总结' : '实时汇总 · 持续更新'}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 space-y-4">
          {/* Profile */}
          {(dp.profile.score || dp.answers.length > 0) && (
            <div className="rounded-xl border border-stone-200 bg-stone-50/50 p-4">
              <div className="flex items-center gap-2 mb-3">
                <User className="w-4 h-4 text-stone-500" />
                <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">考生画像</span>
              </div>
              {dp.profile.score && (
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="bg-white rounded-lg px-3 py-2 border border-stone-100">
                    <div className="text-[10px] text-stone-400">分数</div>
                    <div className="text-sm font-bold text-stone-800">{dp.profile.score}分</div>
                  </div>
                  <div className="bg-white rounded-lg px-3 py-2 border border-stone-100">
                    <div className="text-[10px] text-stone-400">省份</div>
                    <div className="text-sm font-bold text-stone-800">{dp.profile.province}</div>
                  </div>
                  <div className="bg-white rounded-lg px-3 py-2 border border-stone-100">
                    <div className="text-[10px] text-stone-400">选科</div>
                    <div className="text-sm font-bold text-stone-800">{dp.profile.subject}</div>
                  </div>
                  <div className="bg-white rounded-lg px-3 py-2 border border-stone-100">
                    <div className="text-[10px] text-stone-400">位次</div>
                    <div className="text-sm font-bold text-stone-800">{dp.profile.rank || '—'}</div>
                  </div>
                </div>
              )}
              {dp.answers.length > 0 && (
                <div className="space-y-1.5 max-h-[160px] overflow-y-auto">
                  {dp.answers.slice(0, 6).map((a, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <ChevronRight className="w-3 h-3 text-stone-300 mt-0.5 shrink-0" />
                      <span className="text-stone-500">{a.question}：</span>
                      <span className="text-stone-700 font-medium">{a.answer}</span>
                    </div>
                  ))}
                  {dp.answers.length > 6 && (
                    <div className="text-[10px] text-stone-400 text-center pt-1">
                      ...还有 {dp.answers.length - 6} 项
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Structured Summary (LLM-generated) */}
          {showSummary && summary && (
            <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/30 p-4 space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">AI 智能总结</span>
              </div>

              {summary.direction && (
                <div className="bg-white rounded-xl border border-emerald-100 p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Target className="w-3.5 h-3.5 text-amber-500" />
                    <span className="text-[11px] font-bold text-stone-500">总体方向</span>
                  </div>
                  <p className="text-sm text-stone-800 leading-relaxed">{summary.direction}</p>
                </div>
              )}

              {summary.schools.length > 0 && (
                <div className="bg-white rounded-xl border border-emerald-100 p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <School className="w-3.5 h-3.5 text-blue-500" />
                    <span className="text-[11px] font-bold text-stone-500">推荐院校</span>
                  </div>
                  <ul className="space-y-1">
                    {summary.schools.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-stone-700">
                        <MapPin className="w-3 h-3 text-blue-400 mt-0.5 shrink-0" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {summary.majors.length > 0 && (
                <div className="bg-white rounded-xl border border-emerald-100 p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                    <span className="text-[11px] font-bold text-stone-500">推荐专业</span>
                  </div>
                  <ul className="space-y-1">
                    {summary.majors.map((m, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-stone-700">
                        <ChevronRight className="w-3 h-3 text-purple-400 mt-0.5 shrink-0" />
                        {m}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {summary.warnings.length > 0 && (
                <div className="bg-white rounded-xl border border-red-100 p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                    <span className="text-[11px] font-bold text-stone-500">风险提示</span>
                  </div>
                  <ul className="space-y-1">
                    {summary.warnings.map((w, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-red-700">
                        <span className="text-red-400 mt-0.5 shrink-0">⚠</span>
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {summary.decision_path.length > 0 && (
                <div className="bg-white rounded-xl border border-emerald-100 p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-[11px] font-bold text-stone-500">决策路径</span>
                  </div>
                  <ul className="space-y-1.5">
                    {summary.decision_path.map((d, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-stone-700">
                        <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        {d}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Generating indicator */}
          {!showSummary && cp === 'debating' && dp.entries.length >= 2 && (
            <div className="flex items-center justify-center gap-2 py-4 text-stone-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span className="text-xs">辩论中，方案将在完成后总结...</span>
            </div>
          )}

          {/* Tiered School Recommendations */}
          {dp.schoolRecos && (dp.schoolRecos.reach.length > 0 || dp.schoolRecos.steady.length > 0 || dp.schoolRecos.safety.length > 0) && (
            <div className="rounded-xl border-2 border-blue-200 bg-blue-50/30 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <School className="w-4 h-4 text-blue-600" />
                <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">院校推荐（冲稳保）</span>
              </div>
              {([
                { key: 'reach', label: '冲', color: 'bg-red-100 text-red-700', border: 'border-red-200', data: dp.schoolRecos.reach },
                { key: 'steady', label: '稳', color: 'bg-amber-100 text-amber-700', border: 'border-amber-200', data: dp.schoolRecos.steady },
                { key: 'safety', label: '保', color: 'bg-emerald-100 text-emerald-700', border: 'border-emerald-200', data: dp.schoolRecos.safety },
              ] as const).map(tier => tier.data.length > 0 && (
                <div key={tier.key} className={`bg-white rounded-lg border ${tier.border} p-2.5`}>
                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${tier.color} mb-2`}>
                    {tier.label} · {tier.data.length}所
                  </span>
                  <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                    {tier.data.map((s, i) => (
                      <div key={i} className="text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-stone-800 truncate max-w-[140px]">{s.school}</span>
                          <span className="text-[10px] text-stone-400 font-mono">{s.avg_score}分</span>
                        </div>
                        {s.majors?.length > 0 && (
                          <div className="text-[10px] text-stone-400 truncate mt-0.5">
                            {s.majors.slice(0, 2).map(m => m.name.slice(0, 10)).join(' · ')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Excerpts during debate (before summary) */}
          {!showSummary && sectionOrder.map(section => {
            const items = grouped[section];
            if (!items?.length) return null;
            return (
              <div key={section} className="space-y-2">
                <div className="flex items-center gap-2">
                  {SECTION_ICONS[section]}
                  <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">
                    {SECTION_LABELS[section]}
                  </span>
                </div>
                <AnimatePresence>
                  {items.map((entry, i) => (
                    <motion.div
                      key={`${section}-${i}`}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className={`rounded-lg border-l-[3px] px-3 py-2.5 ${SECTION_COLORS[section] || 'border-l-stone-300 bg-stone-50'}`}
                    >
                      <div className="text-[10px] text-stone-400 mb-0.5">{entry.source}</div>
                      <div className="text-xs text-stone-700 leading-relaxed whitespace-pre-wrap">{entry.content}</div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            );
          })}

          {/* Thinking indicator */}
          {cp === 'thinking' && !dp.entries.length && (
            <div className="flex items-center justify-center gap-2 py-8 text-stone-400">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              <span className="text-xs">等待分析结果...</span>
            </div>
          )}

          {/* Empty state */}
          {!hasContent && cp !== 'thinking' && (
            <div className="flex flex-col items-center justify-center py-12 text-stone-300 gap-2">
              <FileText className="w-8 h-8" />
              <span className="text-xs">方案将在此实时汇总</span>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
