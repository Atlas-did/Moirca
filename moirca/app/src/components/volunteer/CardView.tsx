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
  冲: 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950',
  稳: 'border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950',
  保: 'border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950',
};

const TIER_DOT: Record<string, string> = {
  冲: 'bg-red-500',
  稳: 'bg-blue-500',
  保: 'bg-green-500',
};

export default function CardView() {
  const { state, dispatch } = useApp();

  const handleToggleStar = (id: string) => dispatch({ type: 'TOGGLE_STAR', payload: id });

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {state.volunteerData.map((row, idx) => {
          const tier = row.isStarred ? '保' : (row.majorName.includes('计算机') || row.majorName.includes('软件') ? '稳' : '冲');
          const tc = TIER_COLORS[tier] || TIER_COLORS['稳'];

          return (
            <motion.div
              key={row.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.04 }}
              className={`rounded-xl border ${tc} p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer`}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full ${TIER_DOT[tier]}`} />
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{tier}</span>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleToggleStar(row.id); }}
                  className="transition-colors"
                >
                  <Star className={`w-4 h-4 ${row.isStarred ? 'text-yellow-400 fill-yellow-400' : 'text-slate-300 hover:text-yellow-400'}`} />
                </button>
              </div>

              {/* Major name */}
              <h4 className="font-semibold text-slate-800 dark:text-slate-100 text-sm mb-1 truncate">
                {row.majorName}
              </h4>

              {/* School */}
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 truncate">
                {row.schoolName}
              </p>

              {/* Stats row */}
              <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mb-2">
                {row.planCount > 0 && (
                  <span className="flex items-center gap-1">
                    <Info className="w-3 h-3" />
                    计划 {row.planCount}
                  </span>
                )}
                {row.admissionTrend?.length > 0 && (
                  <span className="flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />
                    {row.admissionTrend[row.admissionTrend.length - 1]}分
                  </span>
                )}
              </div>

              {/* Remark / Risk */}
              {row.remark && (
                <div className="text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed line-clamp-2">
                  {row.remark}
                </div>
              )}
              {row.risk_note && (
                <div className="mt-1 flex items-start gap-1 text-[10px] text-amber-600 dark:text-amber-400">
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
