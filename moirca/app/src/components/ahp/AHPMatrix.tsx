/**
 * AHP 对比分析 — 接入后端 POST /api/compare/
 *
 * 流程:
 *   1. 在志愿表中收藏至少 2 个志愿 → 自动成为 AHP 候选人
 *   2. 点击 "AI 对比" → 调用后端 API → 预填滑块
 *   3. 手动调整滑块微调偏好
 *   4. 雷达图 + AI 建议 + 用户结论 三方对照
 */
import { useState, useMemo, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { motion } from 'framer-motion';
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
} from 'recharts';
import {
  AlertTriangle, CheckCircle, GitCompareArrows,
  Sparkles, Loader2, RefreshCw,
} from 'lucide-react';
import { compareVolunteers, type DimensionResult } from '@/api/recommend';

const DIMENSIONS = [
  { id: 'employment', name: '就业质量' },
  { id: 'school', name: '学校层次' },
  { id: 'city', name: '城市区位' },
  { id: 'interest', name: '专业兴趣' },
  { id: 'family', name: '家庭适配' },
];

/** 将后端维度 winner 转为滑块值: winner=left → -5, winner=right → +5, tie → 0 */
function dimWinnerToSlider(winner: string): number {
  if (winner === 'left') return -5;
  if (winner === 'right') return 5;
  return 0;
}

export default function AHPMatrix() {
  const { state, dispatch } = useApp();

  // ---- 候选人来源：收藏的志愿 ----
  const starredVolunteers = useMemo(
    () => state.volunteerData.filter(v => v.isStarred),
    [state.volunteerData],
  );

  // 自动同步前 2 个收藏到 AHP 候选
  const candidates = useMemo(() => {
    if (starredVolunteers.length >= 2) {
      return [
        { id: starredVolunteers[0].id, name: starredVolunteers[0].schoolName },
        { id: starredVolunteers[1].id, name: starredVolunteers[1].schoolName },
      ];
    }
    return state.ahpCandidates;
  }, [starredVolunteers, state.ahpCandidates]);

  const [comparisons, setComparisons] = useState<Record<string, number>>({});
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<{
    dims: DimensionResult[];
    recommendation: string;
    risks: string[];
    summary: string;
  } | null>(null);
  const [aiError, setAiError] = useState('');

  // ---- 不足 2 个候选时的提示 ----
  if (candidates.length < 2) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center">
        <GitCompareArrows className="w-12 h-12 text-slate-500 mb-3" />
        <p className="text-slate-400 text-sm">需要至少 2 个候选院校</p>
        <p className="text-slate-500 text-xs mt-1">
          {starredVolunteers.length < 2
            ? '请在志愿表中收藏至少 2 个志愿（点击 ⭐）'
            : '已自动检测收藏的志愿'}
        </p>
      </div>
    );
  }

  // ---- AI 对比 ----
  const handleAIC = async () => {
    setAiLoading(true);
    setAiError('');
    try {
      const data = await compareVolunteers({
        left: { school: candidates[0].name, major: '计算机科学与技术' },
        right: { school: candidates[1].name, major: '软件工程' },
        score: 585,
        province: '广东',
        keywords: [],
      });
      setAiResult({
        dims: data.dimensions,
        recommendation: data.recommendation,
        risks: data.risks,
        summary: data.summary,
      });

      // 预填滑块
      const newComparisons: Record<string, number> = {};
      const dimMap: Record<string, string> = {
        '院校层次': 'school',
        '录取概率': 'school',
        '就业确定性': 'employment',
        '城市发展': 'city',
        '偏好匹配': 'interest',
      };
      data.dimensions.forEach(d => {
        const ahpId = dimMap[d.name];
        if (ahpId) {
          newComparisons[`${candidates[0].id}_${candidates[1].id}_${ahpId}`] = dimWinnerToSlider(d.winner);
        }
      });
      // 没有直接映射的维度默认中性
      DIMENSIONS.forEach(dim => {
        const key = `${candidates[0].id}_${candidates[1].id}_${dim.id}`;
        if (!(key in newComparisons)) newComparisons[key] = 0;
      });
      setComparisons(newComparisons);
    } catch (e: unknown) {
      setAiError(e instanceof Error ? e.message : '请求失败');
    } finally {
      setAiLoading(false);
    }
  };

  // ---- 滑块变更 ----
  const handleSliderChange = (key: string, value: number) => {
    setComparisons(prev => ({ ...prev, [key]: value }));
  };

  // ---- 计算权重 / CR / 雷达 ----
  const { weights, cr, radarData, winner } = useMemo(() => {
    const w: Record<string, number> = {};
    candidates.forEach(cand => {
      let score = 0;
      DIMENSIONS.forEach(dim => {
        const key = `${candidates[0].id}_${candidates[1].id}_${dim.id}`;
        const val = comparisons[key] || 0;
        const relative = cand.id === candidates[0].id ? (9 - val) / 18 : (9 + val) / 18;
        score += relative * 0.2 * 100;
      });
      w[cand.id] = Math.round(score * 100) / 100;
    });

    const crVal = Math.abs(Object.values(comparisons).reduce((a, b) => a + Math.abs(b), 0))
      / (DIMENSIONS.length * 9);
    const crRounded = Math.round(crVal * 1000) / 1000;

    const rd = DIMENSIONS.map(dim => {
      const key = `${candidates[0].id}_${candidates[1].id}_${dim.id}`;
      const val = comparisons[key] || 0;
      return {
        dimension: dim.name,
        [candidates[0].name]: ((9 - val) / 18) * 100,
        [candidates[1].name]: ((9 + val) / 18) * 100,
        fullMark: 100,
      };
    });

    const win = w[candidates[0].id] > w[candidates[1].id] ? candidates[0] : candidates[1];
    return { weights: w, cr: crRounded, radarData: rd, winner: win };
  }, [comparisons, candidates]);

  const crPassed = cr < 0.1;

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-3">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-white">AHP 对比分析</h3>
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
              crPassed ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
            }`}>
              {crPassed ? <CheckCircle className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
              CR={cr.toFixed(3)}
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleAIC}
              disabled={aiLoading}
              className="flex items-center gap-1.5 px-3 py-1 bg-blue-500/20 border border-blue-400/30 text-blue-300 rounded-lg text-xs hover:bg-blue-500/30 disabled:opacity-50 transition-all"
            >
              {aiLoading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Sparkles className="w-3.5 h-3.5" />}
              AI 对比
            </motion.button>
          </div>
        </div>

        {/* AI result summary */}
        {aiResult && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-blue-500/10 border border-blue-400/20 rounded-lg p-3 mb-3"
          >
            <div className="flex items-center gap-1.5 mb-1">
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-xs font-medium text-blue-300">AI 分析</span>
              <span className="text-[10px] text-blue-400/70 ml-auto">滑块已预填</span>
            </div>
            <p className="text-xs text-slate-300">{aiResult.recommendation}</p>
            {aiResult.risks.length > 0 && (
              <p className="text-[10px] text-red-400/80 mt-1">{aiResult.risks[0]}</p>
            )}
          </motion.div>
        )}

        {aiError && (
          <div className="bg-red-500/10 border border-red-400/20 rounded-lg p-2 mb-3 text-xs text-red-400 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            {aiError}
          </div>
        )}

        {/* Candidates */}
        <div className="flex items-center justify-between mb-4 bg-slate-700/50 rounded-lg p-3">
          <div className="text-center flex-1">
            <div className="text-lg font-bold text-blue-400">{candidates[0].name}</div>
            <div className="text-xs text-slate-400">权重 {weights[candidates[0].id]?.toFixed(2)}</div>
          </div>
          <div className="text-slate-500 font-medium px-3">VS</div>
          <div className="text-center flex-1">
            <div className="text-lg font-bold text-cyan-400">{candidates[1].name}</div>
            <div className="text-xs text-slate-400">权重 {weights[candidates[1].id]?.toFixed(2)}</div>
          </div>
        </div>

        {/* Comparison Sliders */}
        <div className="space-y-3 mb-4">
          {DIMENSIONS.map(dim => {
            const key = `${candidates[0].id}_${candidates[1].id}_${dim.id}`;
            const val = comparisons[key] || 0;
            return (
              <motion.div
                key={dim.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-slate-700/30 rounded-lg p-3"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-300">{dim.name}</span>
                  <span className={`text-xs font-medium ${
                    val < -2 ? 'text-blue-400' : val > 2 ? 'text-cyan-400' : 'text-slate-400'
                  }`}>
                    {val === 0
                      ? '同等'
                      : val < 0
                        ? `${candidates[0].name} +${Math.abs(val)}`
                        : `${candidates[1].name} +${val}`}
                  </span>
                </div>
                <input
                  type="range"
                  min={-9}
                  max={9}
                  step={1}
                  value={val}
                  onChange={e => handleSliderChange(key, parseInt(e.target.value))}
                  className="w-full h-1.5 bg-slate-600 rounded-full appearance-none cursor-pointer accent-blue-500"
                />
                <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                  <span>{candidates[0].name}</span>
                  <span>同等</span>
                  <span>{candidates[1].name}</span>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Radar Chart */}
        {Object.keys(comparisons).length > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-700/30 rounded-lg p-3 mb-3"
          >
            <h4 className="text-xs font-medium text-slate-300 mb-2">维度对比雷达图</h4>
            <ResponsiveContainer width="100%" height={200}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#334155" />
                <PolarAngleAxis dataKey="dimension" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 9 }} />
                <Radar name={candidates[0].name} dataKey={candidates[0].name} stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} strokeWidth={2} />
                <Radar name={candidates[1].name} dataKey={candidates[1].name} stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.2} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </motion.div>
        )}

        {/* Conclusion */}
        {Object.keys(comparisons).length >= DIMENSIONS.length && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-r from-blue-500/20 to-cyan-500/20 border border-blue-400/30 rounded-lg p-3"
          >
            <div className="text-xs text-blue-300 mb-1">分析结论</div>
            <div className="text-sm text-white">
              综合评分 <span className="font-bold text-blue-400">{winner.name}</span> 更优（
              {weights[winner.id]?.toFixed(2)}）。
              {Math.abs((weights[candidates[0].id] ?? 0) - (weights[candidates[1].id] ?? 0)) < 5
                ? ' 两校差距较小，建议结合更多信息决策。'
                : ` 差距较明显，你的偏好方向比较清晰。`}
            </div>
            {/* AI recommendation comparison */}
            {aiResult && (
              <details className="mt-2">
                <summary className="text-[10px] text-blue-400/70 cursor-pointer">查看 AI 原始分析</summary>
                <p className="text-[10px] text-slate-400 mt-1">{aiResult.summary}</p>
              </details>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
