/**
 * 分数输入条 — 触发 AI 推荐
 *
 * 对接: POST /api/recommend/
 */
import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { motion } from 'framer-motion';
import { Sparkles, Loader2, Clock3, RefreshCw } from 'lucide-react';
import {
  getRecommendations,
  startAsyncRecommendation,
  getAsyncRecommendationStatus,
  type RecommendItem,
  type RecommendResponse,
} from '@/api/recommend';
import type { VolunteerRow } from '@/types';

const PROVINCES = ['广东','北京','上海','浙江','江苏','湖北','湖南','四川','山东','河南'];
function recommendToVolunteerRow(r: RecommendItem, idx: number): VolunteerRow {
  return {
    id: `rec_${r.major_code}_${idx}`,
    schoolCode: r.major_code.slice(0, 4),
    schoolName: r.school || '推荐院校',
    batch: '本科批',
    subjectType: '物理类',
    planType: '普通类',
    groupCode: 'AI',
    groupName: 'AI推荐组',
    majorCode: r.major_code,
    majorName: r.major,
    planCount: 0,
    fee: 0,
    remark: `${r.reason} | 置信度 ${(r.confidence * 100).toFixed(0)}%`,
    admissionTrend: Array(3).fill(Math.round(r.match_score)),
    isStarred: r.tier === '保',
    hasNote: !!r.risk_note,
    noteContent: r.risk_note || '',
  };
}

function applyRecommendResponse(dispatch: ReturnType<typeof useApp>['dispatch'], data: RecommendResponse) {
  const rows = data.recommendations.map((r, i) => recommendToVolunteerRow(r, i));
  dispatch({ type: 'LOAD_VOLUNTEER_DATA', payload: rows });
  dispatch({
    type: 'SET_RECOMMEND_META',
    payload: {
      profile: data.profile,
      tierSummary: data.tier_summary,
      warnings: data.warnings,
    },
  });
}

export default function ScoreInputBar() {
  const { dispatch } = useApp();
  const [score, setScore] = useState('585');
  const [province, setProvince] = useState('广东');
  const [keywords, setKeywords] = useState('');
  const [loading, setLoading] = useState(false);
  const [asyncLoading, setAsyncLoading] = useState(false);
  const [asyncJobId, setAsyncJobId] = useState('');
  const [asyncProgress, setAsyncProgress] = useState(0);
  const [asyncMessage, setAsyncMessage] = useState('');
  const [error, setError] = useState('');
  const pollTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current);
      }
    };
  }, []);

  const handleGenerate = async () => {
    const scoreNum = parseInt(score);
    if (!scoreNum || scoreNum < 100 || scoreNum > 750) {
      setError('请输入有效分数 (100-750)');
      return;
    }
    setError('');
    setLoading(true);

    try {
      const data = await getRecommendations({
        score: scoreNum,
        province,
        keywords: keywords ? keywords.split(/[,，\s]+/) : [],
        top_n: 15,
      });

      applyRecommendResponse(dispatch, data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '请求失败';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleAsyncGenerate = async () => {
    const scoreNum = parseInt(score);
    if (!scoreNum || scoreNum < 100 || scoreNum > 750) {
      setError('请输入有效分数 (100-750)');
      return;
    }
    setError('');
    setAsyncLoading(true);
    setAsyncProgress(0);
    setAsyncMessage('提交后台任务...');

    if (pollTimerRef.current) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    try {
      const job = await startAsyncRecommendation({
        score: scoreNum,
        province,
        keywords: keywords ? keywords.split(/[,，\s]+/) : [],
        top_n: 15,
      });
      setAsyncJobId(job.job_id);

      pollTimerRef.current = window.setInterval(async () => {
        try {
          const status = await getAsyncRecommendationStatus(job.job_id);
          setAsyncProgress(status.progress);
          setAsyncMessage(status.message);

          if (status.status === 'completed' && status.result) {
            applyRecommendResponse(dispatch, status.result);
            if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
            setAsyncLoading(false);
          } else if (status.status === 'failed' || status.status === 'not_found') {
            if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
            setAsyncLoading(false);
            setError(status.message || '异步推荐失败');
          }
        } catch (pollErr: unknown) {
          if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
          setAsyncLoading(false);
          const msg = pollErr instanceof Error ? pollErr.message : '轮询失败';
          setError(msg);
        }
      }, 1200);
    } catch (e: unknown) {
      setAsyncLoading(false);
      const msg = e instanceof Error ? e.message : '提交失败';
      setError(msg);
    }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-blue-50 to-cyan-50 border-b border-blue-100">
      {/* Score */}
      <div className="flex items-center gap-1.5">
        <label className="text-xs font-medium text-slate-600 whitespace-nowrap">分数</label>
        <input
          type="number"
          value={score}
          onChange={e => setScore(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleGenerate()}
          className="w-20 text-center border border-slate-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500"
          placeholder="585"
          min={100}
          max={750}
        />
      </div>

      {/* Province */}
      <div className="flex items-center gap-1.5">
        <label className="text-xs font-medium text-slate-600 whitespace-nowrap">省份</label>
        <select
          value={province}
          onChange={e => setProvince(e.target.value)}
          className="border border-slate-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500"
        >
          {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* Keywords */}
      <div className="flex items-center gap-1.5 flex-1">
        <label className="text-xs font-medium text-slate-600 whitespace-nowrap">偏好</label>
        <input
          type="text"
          value={keywords}
          onChange={e => setKeywords(e.target.value)}
          placeholder="如: 编程, 人工智能 (可选)"
          className="flex-1 border border-slate-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Generate Button */}
      <div className="flex items-center gap-2 shrink-0">
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={handleGenerate}
          disabled={loading || asyncLoading}
          className="flex items-center gap-2 px-4 py-1.5 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50 transition-all shadow-sm"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          同步推荐
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={handleAsyncGenerate}
          disabled={loading || asyncLoading}
          className="flex items-center gap-2 px-4 py-1.5 bg-slate-700 text-white rounded-lg text-sm font-medium hover:bg-slate-600 disabled:opacity-50 transition-all shadow-sm"
        >
          {asyncLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          后台推荐
        </motion.button>
      </div>

      {(asyncLoading || asyncJobId) && (
        <div className="ml-2 min-w-[170px] flex-1">
          <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
            <span className="flex items-center gap-1"><Clock3 className="w-3 h-3" /> 异步进度</span>
            <span>{asyncProgress}%</span>
          </div>
          <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
            <div className="h-full bg-cyan-500 rounded-full transition-all" style={{ width: `${asyncProgress}%` }} />
          </div>
          <div className="mt-1 text-[10px] text-slate-500 truncate" title={asyncMessage}>{asyncMessage || asyncJobId}</div>
        </div>
      )}

      {/* Error */}
      {error && (
        <span className="text-xs text-red-500 shrink-0">{error}</span>
      )}
    </div>
  );
}
