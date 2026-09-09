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
        className="h-8 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
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
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
              onClick={e => e.stopPropagation()}
              className="panel-card p-6 w-[400px] shadow-md"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="panel-title">刷新数据</h3>
                <button onClick={() => setShowModal(false)} className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 mb-5">
                <div className="flex items-start gap-3 p-3 bg-muted/60 border border-border border-l-[3px] border-l-primary rounded-r-md">
                  <RefreshCw className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <div className="text-[13px] font-medium text-foreground">全量刷新</div>
                    <div className="text-xs text-muted-foreground">
                      重新拉取知识图谱数据 + 重新运行 Agent 推荐引擎
                    </div>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground space-y-1.5">
                  {STEPS.map((step, i) => {
                    const Icon = step.icon;
                    return (
                      <div key={step.id} className="flex items-center gap-2">
                        <Icon className={`w-3.5 h-3.5 ${
                          i < currentStepIdx ? 'text-[hsl(var(--success))]'
                            : i === currentStepIdx && state.isUpdating ? 'text-primary'
                            : 'text-muted-foreground/40'
                        }`} />
                        <span className={i <= currentStepIdx ? 'text-foreground' : 'text-muted-foreground/60'}>
                          {step.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={handleUpdate}
                className="w-full h-9 text-[13px] bg-primary text-primary-foreground rounded-md hover:bg-primary/90 shadow-xs transition-colors"
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
            className="fixed bottom-6 right-6 z-50 panel-card shadow-md p-4 w-72"
          >
            <div className="flex items-center gap-2 mb-2">
              <Loader className="w-4 h-4 text-primary animate-spin" />
              <span className="text-[13px] font-medium text-foreground">正在刷新...</span>
            </div>
            <div className="w-full h-1 bg-border rounded-sm overflow-hidden">
              <motion.div
                className="h-full bg-primary"
                initial={{ width: 0 }}
                animate={{ width: `${state.versionUpdateProgress}%` }}
                transition={{ type: 'tween', duration: 0.3 }}
              />
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="text-[11px] text-muted-foreground">
                {STEPS[currentStepIdx]?.label || '更新中'}
              </span>
              <span className="text-[11px] text-muted-foreground tabular-nums">{state.versionUpdateProgress}%</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
