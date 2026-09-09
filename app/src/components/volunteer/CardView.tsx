/**
 * 推荐卡片视图 — 卡片网格替代表格展示
 *
 * 来自 EduPath-AI / rank2college 的卡片网格模式
 */
import { useApp } from '@/contexts/AppContext';
import { motion } from 'framer-motion';
import { Star, TrendingUp, AlertTriangle, Info } from 'lucide-react';
import type { VolunteerRow } from '@/types';

const TIER_COLORS: Record<string, string> = {
  冲: 'border-l-destructive/70',
  稳: 'border-l-primary/70',
  保: 'border-l-[hsl(var(--success))]',
};

const TIER_DOT: Record<string, string> = {
  冲: 'bg-destructive',
  稳: 'bg-primary',
  保: 'bg-[hsl(var(--success))]',
};

const TIER_BADGE: Record<string, string> = {
  冲: 'border-destructive/40 bg-destructive/10 text-destructive',
  稳: 'border-primary/40 bg-primary/10 text-primary',
  保: 'border-[hsl(var(--success)/0.4)] bg-[hsl(var(--success)/0.1)] text-[hsl(var(--success))]',
};

export default function CardView() {
  const { state, dispatch } = useApp();

  const handleToggleStar = (id: string) => dispatch({ type: 'TOGGLE_STAR', payload: id });

  return (
    <div className="h-full overflow-y-auto p-4 thin-scrollbar">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 items-start">
        {state.volunteerData.map((row, idx) => {
          const tier = row.isStarred ? '保' : (row.majorName.includes('计算机') || row.majorName.includes('软件') ? '稳' : '冲');
          const lc = TIER_COLORS[tier] || TIER_COLORS['稳'];

          return (
            <motion.div
              key={row.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.03 }}
              className={`rounded-lg border border-border border-l-[3px] ${lc} bg-card p-4 shadow-xs transition-colors duration-150 cursor-pointer`}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-2">
                <span className={`inline-flex items-center gap-1.5 border rounded-sm px-1.5 py-0.5 text-[11px] font-medium ${TIER_BADGE[tier] || TIER_BADGE['稳']}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${TIER_DOT[tier]}`} />
                  {tier}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleToggleStar(row.id); }}
                  className="p-0.5 rounded-md transition-colors"
                >
                  <Star className={`w-4 h-4 ${row.isStarred ? 'text-[hsl(var(--chart-5))] fill-[hsl(var(--chart-5))]' : 'text-muted-foreground/40 hover:text-[hsl(var(--chart-5))]'}`} />
                </button>
              </div>

              {/* Major name */}
              <h4 className="font-semibold text-foreground text-sm mb-1 truncate">
                {row.majorName}
              </h4>

              {/* School */}
              <p className="text-xs text-muted-foreground mb-3 truncate">
                {row.schoolName}
              </p>

              {/* Stats row */}
              <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                {row.planCount > 0 && (
                  <span className="flex items-center gap-1 tabular-nums">
                    <Info className="w-3 h-3" />
                    计划 {row.planCount}
                  </span>
                )}
                {row.admissionTrend?.length > 0 && (
                  <span className="flex items-center gap-1 tabular-nums">
                    <TrendingUp className="w-3 h-3" />
                    {row.admissionTrend[row.admissionTrend.length - 1]}分
                  </span>
                )}
              </div>

              {/* Remark / Risk */}
              {row.remark && (
                <div className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                  {row.remark}
                </div>
              )}
              {row.risk_note && (
                <div className="mt-1 flex items-start gap-1 text-[11px] text-[hsl(var(--warning))]">
                  <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                  {row.risk_note}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
