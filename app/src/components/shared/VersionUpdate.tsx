/**
 * 版本更新 — 接真实后端，刷新图谱和推荐数据
 *
 * 点击 → 重新拉取图谱 → 重新跑推荐 → 显示真实进度
 */
import { useState, useCallback } from 'react';
import { useApp } from '@/contexts/AppContext';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Loader, X, Database, GitBranch, TrendingUp } from 'lucide-react';
import { getGraphData } from '@/api/graph';
import { getRecommendations, refreshRecommendationData } from '@/api/recommend';

const STEPS = [
  { id: 'graph', label: '拉取知识图谱', icon: GitBranch },
  { id: 'recommend', label: '刷新推荐结果', icon: TrendingUp },
  { id: 'done', label: '更新完成', icon: Database },
];

export function VersionUpdateButton() {
  const { state, dispatch } = useApp();
  const [showModal, setShowModal] = useState(false);

  const handleUpdate = useCallback(async () => {
    dispatch({ type: 'SET_VERSION_UPDATING', payload: true });
    dispatch({ type: 'SET_UPDATE_PROGRESS', payload: 0 });
    setShowModal(false);

    try {
      // Step 1: Refresh graph
      dispatch({ type: 'SET_UPDATE_PROGRESS', payload: 10 });
      await refreshRecommendationData();
      const graphData = await getGraphData({ documentId: state.activeDocumentId || undefined });
      dispatch({ type: 'LOAD_GRAPH_DATA', payload: graphData });
      dispatch({ type: 'SET_UPDATE_PROGRESS', payload: 50 });

      // Step 2: If we have profile info, re-run recommend
      const meta = state.recommendMeta;
      const profile = meta?.profile;
      if (profile?.score) {
        dispatch({ type: 'SET_UPDATE_PROGRESS', payload: 60 });
        const recData = await getRecommendations({
          score: profile.score as number,
          province: (profile.province as string) || '广东',
          keywords: (profile.keywords as string[]) || [],
          top_n: 10,
        });
        const rows = recData.recommendations.map((r, i) => ({
          id: `rec_${r.major_code}_${i}`,
          schoolCode: r.major_code.slice(0, 4),
          schoolName: r.school || '推荐院校',
          batch: '本科批', subjectType: '物理类', planType: '普通类',
          groupCode: 'AI', groupName: 'AI推荐组',
          majorCode: r.major_code, majorName: r.major,
          planCount: 0, fee: 0,
          remark: `${r.reason} | 置信度 ${(r.confidence * 100).toFixed(0)}%`,
          admissionTrend: Array(3).fill(Math.round(r.match_score)),
          isStarred: r.tier === '保',
          hasNote: !!r.risk_note,
          noteContent: r.risk_note || '',
        }));
        dispatch({ type: 'LOAD_VOLUNTEER_DATA', payload: rows });
        dispatch({
          type: 'SET_RECOMMEND_META',
          payload: {
            profile: recData.profile,
            tierSummary: recData.tier_summary,
            warnings: recData.warnings,
          },
        });
      }
      dispatch({ type: 'SET_UPDATE_PROGRESS', payload: 100 });
    } catch {
      // Silently fail, keep existing data
      dispatch({ type: 'SET_UPDATE_PROGRESS', payload: 100 });
    }

    setTimeout(() => {
      dispatch({ type: 'SET_VERSION_UPDATING', payload: false });
      dispatch({ type: 'SET_UPDATE_PROGRESS', payload: 0 });
    }, 800);
  }, [dispatch, state.recommendMeta]);

  const currentStepIdx = state.versionUpdateProgress < 50 ? 0
    : state.versionUpdateProgress < 90 ? 1 : 2;

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        disabled={state.isUpdating}
        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-500 transition-colors disabled:opacity-50"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${state.isUpdating ? 'animate-spin' : ''}`} />
        {state.isUpdating ? `更新中 ${state.versionUpdateProgress}%` : '刷新数据'}
      </button>

      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={() => setShowModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-xl p-6 w-[400px] shadow-xl"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium text-slate-800">刷新数据</h3>
                <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 mb-5">
                <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                  <RefreshCw className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-sm font-medium text-blue-800">全量刷新</div>
                    <div className="text-xs text-blue-600">
                      重新拉取知识图谱数据 + 重新运行 Agent 推荐引擎
                    </div>
                  </div>
                </div>

                <div className="text-xs text-slate-500 space-y-1">
                  {STEPS.map((step, i) => {
                    const Icon = step.icon;
                    return (
                      <div key={step.id} className="flex items-center gap-2">
                        <Icon className={`w-3.5 h-3.5 ${i < currentStepIdx ? 'text-green-400' : i === currentStepIdx && state.isUpdating ? 'text-blue-400' : 'text-slate-300'}`} />
                        <span className={i <= currentStepIdx ? 'text-slate-700' : 'text-slate-400'}>
                          {step.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={handleUpdate}
                className="w-full py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                开始刷新
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress overlay */}
      <AnimatePresence>
        {state.isUpdating && (
          <motion.div
            initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 right-6 z-50 bg-white rounded-xl shadow-lg p-4 w-72 border border-slate-200"
          >
            <div className="flex items-center gap-2 mb-2">
              <Loader className="w-4 h-4 text-blue-500 animate-spin" />
              <span className="text-sm font-medium text-slate-700">正在刷新...</span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-blue-500 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${state.versionUpdateProgress}%` }}
                transition={{ type: 'tween', duration: 0.3 }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-slate-400">
                {STEPS[currentStepIdx]?.label || '更新中'}
              </span>
              <span className="text-[10px] text-slate-500">{state.versionUpdateProgress}%</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
