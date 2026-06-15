import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, TrendingUp, Briefcase, Shield, MapPin, AlertTriangle } from 'lucide-react';

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
    <div className="h-full overflow-y-auto">
      <div className="p-3">
        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-indigo-400" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-white">{schoolName}</h3>
            <p className="text-[10px] text-slate-400">4维度深度研究</p>
          </div>
        </div>

        {/* Modeling Pipeline */}
        <div className="mb-4">
          <h4 className="text-xs font-medium text-slate-400 mb-2">建模流程</h4>
          <div className="space-y-1">
            {steps.map((step, idx) => (
              <div key={step.id}>
                <button
                  onClick={() => toggleStep(step.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-700/30 hover:bg-slate-700/50 transition-colors"
                >
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                    step.status === 'done' ? 'bg-green-500/20 text-green-400' :
                    step.status === 'active' ? 'bg-blue-500/20 text-blue-400' :
                    'bg-slate-600 text-slate-400'
                  }`}>
                    {step.status === 'done' ? '✓' : idx + 1}
                  </div>
                  <span className="text-xs text-slate-300 flex-1 text-left">{step.label}</span>
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform ${expandedSteps[step.id] ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {expandedSteps[step.id] && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-3 py-2 text-xs text-slate-400 bg-slate-800/30 mx-2 rounded-b-lg">
                        {step.desc}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>

        {/* 4-Dimension Predictions */}
        <div className="space-y-3">
          {/* Score Prediction */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-slate-700/30 rounded-lg p-3"
          >
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-blue-400" />
              <span className="text-xs font-medium text-slate-200">分数线预测</span>
              <span className="ml-auto text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full">置信度 65%</span>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-2 mb-2">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-blue-400">580-610</span>
                <span className="text-xs text-slate-400">分</span>
              </div>
              <div className="flex gap-1 mt-1">
                {[585, 590, 595, 600, 605].map((v, i) => (
                  <div key={i} className="flex-1 text-center">
                    <div className="h-6 bg-blue-500/30 rounded-sm relative" style={{ height: `${20 + i * 8}px` }} />
                    <div className="text-[9px] text-slate-500 mt-0.5">{v}</div>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-[10px] text-slate-400">基于近3年数据+招生政策变化+报考热度综合预测</p>
          </motion.div>

          {/* Employment */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-slate-700/30 rounded-lg p-3"
          >
            <div className="flex items-center gap-2 mb-2">
              <Briefcase className="w-4 h-4 text-green-400" />
              <span className="text-xs font-medium text-slate-200">就业质量预测</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-800/50 rounded p-2 text-center">
                <div className="text-lg font-bold text-green-400">92%</div>
                <div className="text-[10px] text-slate-400">就业率</div>
              </div>
              <div className="bg-slate-800/50 rounded p-2 text-center">
                <div className="text-lg font-bold text-green-400">12.8万</div>
                <div className="text-[10px] text-slate-400">平均年薪</div>
              </div>
            </div>
          </motion.div>

          {/* Stability */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-slate-700/30 rounded-lg p-3"
          >
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-4 h-4 text-orange-400" />
              <span className="text-xs font-medium text-slate-200">专业稳定性</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">专业评分</span>
              <span className="text-orange-400 font-medium">8.2/10</span>
            </div>
            <div className="w-full h-1.5 bg-slate-600 rounded-full mt-1 mb-2">
              <div className="h-full bg-orange-400 rounded-full" style={{ width: '82%' }} />
            </div>
            <div className="text-[10px] text-slate-400">
              近5年新增相关专业方向 2 个，无撤销记录
            </div>
          </motion.div>

          {/* City Value */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-slate-700/30 rounded-lg p-3"
          >
            <div className="flex items-center gap-2 mb-2">
              <MapPin className="w-4 h-4 text-purple-400" />
              <span className="text-xs font-medium text-slate-200">城市区位价值</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="text-slate-400">GDP增速 <span className="text-purple-400">6.8%</span></div>
              <div className="text-slate-400">产业布局 <span className="text-purple-400">A+</span></div>
            </div>
          </motion.div>
        </div>

        {/* Risk Warning */}
        <div className="mt-3 bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div>
            <div className="text-xs font-medium text-red-300">风险提示</div>
            <p className="text-[10px] text-red-400/80 mt-0.5">
              以上预测基于历史数据和模型推算，仅供参考。实际录取情况受多种因素影响，请以官方发布为准。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
