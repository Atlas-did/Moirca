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
          <div className="rounded-md bg-muted/40 px-3 py-1">
            {profile ? (
              <>
                <div className="flex justify-between border-b border-border/50 py-1.5 text-xs"><span className="text-muted-foreground">分数</span><span className="font-medium text-primary tabular-nums">{String(profile.score)}</span></div>
                <div className="flex justify-between border-b border-border/50 py-1.5 text-xs"><span className="text-muted-foreground">占比</span><span className="tabular-nums text-foreground">{String(profile.percentage)}%</span></div>
                <div className="flex justify-between border-b border-border/50 py-1.5 text-xs"><span className="text-muted-foreground">段位</span><span className="tabular-nums text-foreground">{String(profile.auto_tier)}级</span></div>
                <div className="flex justify-between border-b border-border/50 py-1.5 text-xs"><span className="text-muted-foreground">优先级</span><span className="text-foreground">{String(profile.priority)}</span></div>
                <div className="flex justify-between py-1.5 text-xs"><span className="text-muted-foreground">排除</span><span className="text-foreground">{String(profile.exclusion)}</span></div>
              </>
            ) : (
              <p className="py-2 text-xs text-muted-foreground">请先生成推荐结果</p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">系统基于以上画像，从知识图谱和 Agent 调研中为你匹配最适合的专业方向。</p>
        </div>
      ),
    },
    {
      id: 'recommendations', title: '推荐清单', icon: <ListFilter className="w-4 h-4" />,
      render: () => (
        <div className="divide-y divide-border">
          {recs.length === 0 && <p className="text-[13px] text-muted-foreground">暂无推荐结果</p>}
          {recs.map((row, i) => (
            <div key={row.id} className="flex items-start gap-3 py-2.5">
              <span className="w-6 h-6 rounded-sm bg-primary/10 text-primary text-[11px] flex items-center justify-center font-semibold shrink-0 tabular-nums">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-foreground">{row.majorName}</div>
                <div className="text-xs text-muted-foreground">{row.schoolName}</div>
                {row.remark && <div className="text-[11px] text-muted-foreground/80 mt-0.5 line-clamp-2">{row.remark}</div>}
              </div>
              <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-sm border ${
                row.isStarred
                  ? 'border-[hsl(var(--success)/0.4)] bg-[hsl(var(--success)/0.1)] text-[hsl(var(--success))]'
                  : 'border-primary/40 bg-primary/10 text-primary'
              }`}>
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
          {warnings.length === 0 && <p className="text-[13px] text-muted-foreground">暂无风险提示</p>}
          {warnings.map((w, i) => (
            <div key={i} className="rounded-r-sm border-l-[3px] border-l-[hsl(var(--warning))] bg-[hsl(var(--warning)/0.08)] py-2.5 pl-3 pr-3 flex items-start gap-2 text-[13px] text-foreground">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[hsl(var(--warning))]" />
              {w}
            </div>
          ))}
          <div className="text-xs text-muted-foreground">
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
            <div key={i} className="flex items-start gap-2 py-1.5 text-[13px] text-foreground">
              <CheckCircle className="w-4 h-4 text-[hsl(var(--success))] shrink-0 mt-0.5" />
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
    <div className="h-full flex flex-col bg-background">
      <div className="h-10 shrink-0 px-3 border-b border-border flex items-center gap-2 bg-card">
        <LayoutTemplate className="w-4 h-4 text-primary" />
        <span className="text-[13px] font-medium text-foreground">分步报告</span>
        <span className="text-xs text-muted-foreground ml-auto tabular-nums">Step {stepIdx + 1}/{steps.length}</span>
      </div>

      {/* Step outline(v2 §5.9:Tana/outliner 式大纲树,竖 hairline 连接,方角号牌) */}
      <div className="shrink-0 bg-card border-b border-border py-2.5">
        <div className="ml-4 border-l border-border pl-3">
          {steps.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setStepIdx(i)}
              className={`flex w-full items-center gap-2.5 py-1 text-left transition-colors duration-150 ${
                i === stepIdx ? '' : 'hover:bg-accent/60'
              }`}
            >
              <span
                className={`w-6 h-6 rounded-sm flex items-center justify-center text-[11px] font-semibold tabular-nums shrink-0 ${
                  i === stepIdx
                    ? 'bg-primary text-primary-foreground'
                    : i < stepIdx
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {i < stepIdx ? <CheckCircle className="w-3.5 h-3.5" /> : i + 1}
              </span>
              <span
                className={`text-xs ${
                  i === stepIdx ? 'font-medium text-primary' : i < stepIdx ? 'text-muted-foreground' : 'text-muted-foreground/80'
                }`}
              >
                {s.title}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto thin-scrollbar p-4">
        <div className="mb-3 border-b border-border pb-2 flex items-center gap-2">
          <span className="text-muted-foreground">{step.icon}</span>
          <h3 className="text-sm font-semibold tracking-tight text-foreground">{step.title}</h3>
        </div>
        {step.render()}
      </div>

      {/* Navigation */}
      <div className="h-12 shrink-0 px-4 border-t border-border flex items-center justify-between bg-card">
        <button
          onClick={() => setStepIdx(Math.max(0, stepIdx - 1))}
          disabled={isFirst}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30"
        >
          <ChevronLeft className="w-4 h-4" />上一步
        </button>
        <button
          onClick={() => setStepIdx(Math.min(steps.length - 1, stepIdx + 1))}
          disabled={isLast}
          className="flex items-center gap-1 text-xs bg-primary text-primary-foreground px-4 py-1.5 rounded-md hover:bg-primary/90 disabled:opacity-30 shadow-xs"
        >
          下一步<ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
