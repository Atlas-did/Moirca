import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, TrendingUp, AlertTriangle } from 'lucide-react';

export default function DeepResearch() {
  const { state } = useApp();
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({
    data: true, features: false, model: false, predict: true,
  });

  const schoolName = state.selectedSchoolId
    ? state.graphNodes.find(n => n.id === state.selectedSchoolId)?.label || '南昌大学'
    : '南昌大学';

  const toggleStep = (step: string) => {
    setExpandedSteps(prev => ({ ...prev, [step]: !prev[step] }));
  };

  const steps = [
    { id: 'data', label: '数据采集', desc: '抓取官方数据+第三方平台+校友反馈', status: 'done' },
    { id: 'features', label: '特征工程', desc: '历史分数线、招生人数、专业热度、就业数据', status: 'done' },
    { id: 'model', label: '模型选择', desc: '时间序列 + 随机森林 + 专家规则融合', status: 'done' },
    { id: 'predict', label: '预测输出', desc: '生成4维度预测报告', status: 'active' },
  ];

  return (
    <div className="h-full overflow-y-auto thin-scrollbar">
      <div className="p-4">
        {/* Header(v2 §5.13:删图标底座,线性图标裸置于标题行首) */}
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold tracking-tight text-foreground truncate">{schoolName}</h3>
            <p className="text-[11px] text-muted-foreground">4维度深度研究</p>
          </div>
        </div>

        {/* Modeling Pipeline(大纲树式 list-row,hairline 分隔) */}
        <div className="mb-4">
          <h4 className="eyebrow mb-1">建模流程</h4>
          <div className="divide-y divide-border">
            {steps.map((step, idx) => (
              <div key={step.id}>
                <button
                  onClick={() => toggleStep(step.id)}
                  className="list-row h-10 w-full text-left"
                >
                  <span
                    className={`w-6 shrink-0 text-[11px] tabular-nums ${
                      step.status === 'done'
                        ? 'text-[hsl(var(--success))]'
                        : step.status === 'active'
                          ? 'text-primary'
                          : 'text-muted-foreground'
                    }`}
                  >
                    {step.status === 'done' ? '✓' : `[${idx + 1}]`}
                  </span>
                  <span className="text-[13px] text-foreground flex-1">{step.label}</span>
                  <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${expandedSteps[step.id] ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {expandedSteps[step.id] && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mx-3 mb-2 rounded-sm bg-muted/30 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                        {step.desc}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>

        <div className="hr-hairline my-3" />

        {/* 4-Dimension Predictions(hairline 分区,内容直排,不再套 muted 盒) */}
        <div className="space-y-0">
          {/* Score Prediction */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="mb-2 flex items-baseline justify-between">
              <h4 className="eyebrow">分数线预测</h4>
              <span className="rounded-sm bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary">置信度 65%</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-semibold tabular-nums text-foreground">580-610</span>
              <span className="text-xs text-muted-foreground">分</span>
            </div>
            <div className="flex items-end gap-1.5 mt-2">
              {[585, 590, 595, 600, 605].map((v, i) => (
                <div key={i} className="flex-1">
                  <div className="bg-primary/20 rounded-sm" style={{ height: `${6 + i * 2}px` }} />
                  <div className="text-[9px] text-muted-foreground mt-1 text-center tabular-nums">{v}</div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">基于近3年数据+招生政策变化+报考热度综合预测</p>
          </motion.div>

          <div className="hr-hairline my-3" />

          {/* Employment */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
            <h4 className="eyebrow mb-2">就业质量预测</h4>
            <div className="flex gap-6">
              <div className="flex-1">
                <div className="text-xl font-semibold tabular-nums text-foreground">92%</div>
                <div className="text-xs text-muted-foreground">就业率</div>
              </div>
              <div className="w-px self-stretch bg-border" />
              <div className="flex-1">
                <div className="text-xl font-semibold tabular-nums text-foreground">12.8万</div>
                <div className="text-xs text-muted-foreground">平均年薪</div>
              </div>
            </div>
          </motion.div>

          <div className="hr-hairline my-3" />

          {/* Stability(真实指标:全节唯一保留的 h-1 细进度条) */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
            <h4 className="eyebrow mb-2">专业稳定性</h4>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">专业评分</span>
              <span className="text-foreground font-medium tabular-nums">8.2/10</span>
            </div>
            <div className="w-full h-1 bg-border rounded-sm mt-1.5 mb-2 overflow-hidden">
              <div className="h-full bg-primary rounded-sm" style={{ width: '82%' }} />
            </div>
            <div className="text-[11px] text-muted-foreground">
              近5年新增相关专业方向 2 个，无撤销记录
            </div>
          </motion.div>

          <div className="hr-hairline my-3" />

          {/* City Value */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
            <h4 className="eyebrow mb-1">城市区位价值</h4>
            <div className="flex justify-between border-b border-border/50 py-1.5 text-xs">
              <span className="text-muted-foreground">GDP增速</span>
              <span className="text-foreground font-medium tabular-nums">6.8%</span>
            </div>
            <div className="flex justify-between py-1.5 text-xs">
              <span className="text-muted-foreground">产业布局</span>
              <span className="text-foreground font-medium">A+</span>
            </div>
          </motion.div>
        </div>

        {/* Risk Warning(引文条式) */}
        <div className="mt-4 rounded-r-sm border-l-[3px] border-l-destructive bg-destructive/5 py-2.5 pl-3 pr-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <div>
            <div className="text-xs font-medium text-destructive">风险提示</div>
            <p className="text-[11px] text-destructive/80 mt-0.5 leading-relaxed">
              以上预测基于历史数据和模型推算，仅供参考。实际录取情况受多种因素影响，请以官方发布为准。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
