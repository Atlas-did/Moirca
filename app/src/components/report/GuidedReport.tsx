/**
 * 交互式分步报告 — 来自 DeepTutor Guided Learning 模式
 *
 * 分步骤引导用户理解推荐结果:
 *   Step 1: 你的画像
 *   Step 2: 推荐清单
 *   Step 3: 风险提示
 *   Step 4: 复核清单
 */
import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, CheckCircle, User, ListFilter,
  AlertTriangle, ClipboardCheck, LayoutTemplate,
} from 'lucide-react';

interface Step {
  id: string;
  title: string;
  icon: React.ReactNode;
  render: () => React.ReactNode;
}

export default function GuidedReport() {
  const { state } = useApp();
  const [stepIdx, setStepIdx] = useState(0);

  const recs = state.volunteerData.slice(0, 10);
  const profile = state.recommendMeta?.profile;
  const warnings = state.recommendMeta?.warnings || [];

  const steps: Step[] = [
    {
      id: 'profile', title: '你的画像', icon: <User className="w-4 h-4" />,
      render: () => (
        <div className="space-y-3">
          <div className="bg-blue-50 dark:bg-blue-950 rounded-xl p-4 text-sm space-y-2">
            {profile ? (
              <>
                <div className="flex justify-between"><span className="text-slate-500">分数</span><span className="font-bold text-blue-600">{String(profile.score)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">占比</span><span>{String(profile.percentage)}%</span></div>
                <div className="flex justify-between"><span className="text-slate-500">段位</span><span>{String(profile.auto_tier)}级</span></div>
                <div className="flex justify-between"><span className="text-slate-500">优先级</span><span>{String(profile.priority)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">排除</span><span>{String(profile.exclusion)}</span></div>
              </>
            ) : (
              <p className="text-slate-400">请先生成推荐结果</p>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">系统基于以上画像，从知识图谱和 Agent 调研中为你匹配最适合的专业方向。</p>
        </div>
      ),
    },
    {
      id: 'recommendations', title: '推荐清单', icon: <ListFilter className="w-4 h-4" />,
      render: () => (
        <div className="space-y-2">
          {recs.length === 0 && <p className="text-slate-400 text-sm">暂无推荐结果</p>}
          {recs.map((row, i) => (
            <div key={row.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 text-xs flex items-center justify-center font-bold shrink-0">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-slate-800 dark:text-slate-100">{row.majorName}</div>
                <div className="text-xs text-slate-500">{row.schoolName}</div>
                {row.remark && <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-2">{row.remark}</div>}
              </div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${row.isStarred ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'}`}>
                {row.isStarred ? '保' : '稳'}
              </span>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: 'risks', title: '风险提示', icon: <AlertTriangle className="w-4 h-4" />,
      render: () => (
        <div className="space-y-3">
          {warnings.length === 0 && <p className="text-slate-400 text-sm">暂无风险提示</p>}
          {warnings.map((w, i) => (
            <div key={i} className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-start gap-2 text-sm text-amber-800 dark:text-amber-200">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              {w}
            </div>
          ))}
          <div className="text-xs text-slate-500 dark:text-slate-400">
            建议在最终决定前，交叉验证至少 3 个不同来源的信息。
          </div>
        </div>
      ),
    },
    {
      id: 'checklist', title: '复核清单', icon: <ClipboardCheck className="w-4 h-4" />,
      render: () => (
        <div className="space-y-2">
          {[
            '已核对目标院校本科招生网最新招生章程',
            '已确认专业选科要求与自身选科一致',
            '已了解专业的真实就业方向和中位数薪资',
            '已考虑城市因素（实习机会、生活成本）',
            '已与家人/老师讨论志愿方案',
            '已设好保底志愿，避免滑档风险',
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
              <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
              {item}
            </div>
          ))}
        </div>
      ),
    },
  ];

  const step = steps[stepIdx];
  const isFirst = stepIdx === 0;
  const isLast = stepIdx === steps.length - 1;

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-900">
      <div className="h-10 shrink-0 px-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2 bg-white dark:bg-slate-800">
        <LayoutTemplate className="w-4 h-4 text-blue-500" />
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">分步报告</span>
        <span className="text-xs text-slate-400 ml-auto">Step {stepIdx + 1}/{steps.length}</span>
      </div>

      {/* Progress dots */}
      <div className="flex items-center justify-center gap-1.5 py-3 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        {steps.map((s, i) => (
          <button
            key={s.id}
            onClick={() => setStepIdx(i)}
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs transition-all ${
              i === stepIdx ? 'bg-blue-500 text-white' : i < stepIdx ? 'bg-green-100 dark:bg-green-900 text-green-600' : 'bg-slate-100 dark:bg-slate-700 text-slate-400'
            }`}
          >
            {i < stepIdx ? <CheckCircle className="w-3.5 h-3.5" /> : i + 1}
          </button>
        ))}
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-blue-500">{step.icon}</span>
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">{step.title}</h3>
        </div>
        {step.render()}
      </div>

      {/* Navigation */}
      <div className="h-12 shrink-0 px-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between bg-white dark:bg-slate-800">
        <button
          onClick={() => setStepIdx(Math.max(0, stepIdx - 1))}
          disabled={isFirst}
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 disabled:opacity-30"
        >
          <ChevronLeft className="w-4 h-4" />上一步
        </button>
        <button
          onClick={() => setStepIdx(Math.min(steps.length - 1, stepIdx + 1))}
          disabled={isLast}
          className="flex items-center gap-1 text-xs bg-blue-500 text-white px-4 py-1.5 rounded-lg hover:bg-blue-600 disabled:opacity-30"
        >
          下一步<ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
