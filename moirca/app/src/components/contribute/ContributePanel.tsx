import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, ClipboardPaste, Check, AlertTriangle, Database,
  TrendingUp, MapPin, ShieldCheck, Clock, Trash2, ChevronDown
} from 'lucide-react';
import { submitContribution, fetchContributeStats, fetchContributeHistory } from '@/api/contribute';
import type { ContributePayload, ContributeResponse, ContributeStats, ContributeHistoryItem } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';

function getOrCreateAnonymousId(): string {
  const key = 'moirca_anonymous_id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = 'anon_' + Math.random().toString(36).slice(2, 14) + Date.now().toString(36);
    localStorage.setItem(key, id);
  }
  return id;
}

export default function ContributePanel() {
  const [jsonText, setJsonText] = useState('');
  const [parsed, setParsed] = useState<ContributePayload | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ContributeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<ContributeStats | null>(null);
  const [history, setHistory] = useState<ContributeHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const anonymousId = getOrCreateAnonymousId();

  useEffect(() => {
    fetchContributeStats().then(setStats).catch(() => {});
    fetchContributeHistory(anonymousId)
      .then((res) => setHistory(res.items || []))
      .catch(() => {});
  }, [anonymousId]);

  const handleParse = () => {
    setError(null);
    setResult(null);
    if (!jsonText.trim()) {
      setError('请粘贴从油猴脚本导出的 JSON 数据');
      return;
    }
    try {
      const data = JSON.parse(jsonText);
      if (!data.province || !data.volunteers || !Array.isArray(data.volunteers)) {
        setError('JSON 格式不正确：缺少 province 或 volunteers 字段');
        return;
      }
      setParsed({
        province: data.province,
        volunteers: data.volunteers,
        user_profile: data.user_profile,
        exported_at: data.exported_at,
        anonymous_id: anonymousId,
      });
    } catch (e) {
      setError('JSON 解析失败，请检查格式');
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setJsonText(text);
      try {
        const data = JSON.parse(text);
        if (data.province && data.volunteers) {
          setParsed({
            province: data.province,
            volunteers: data.volunteers,
            user_profile: data.user_profile,
            exported_at: data.exported_at,
            anonymous_id: anonymousId,
          });
          setError(null);
        }
      } catch (_) {}
    } catch (_) {
      setError('无法读取剪贴板，请手动粘贴');
    }
  };

  const handleSubmit = async () => {
    if (!parsed) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await submitContribution(parsed);
      setResult(res);
      // 刷新统计和历史
      const newStats = await fetchContributeStats().catch(() => null);
      if (newStats) setStats(newStats);
      const newHistory = await fetchContributeHistory(anonymousId).catch(() => null);
      if (newHistory) setHistory(newHistory.items || []);
    } catch (e: any) {
      setError(e.message || '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClear = () => {
    setJsonText('');
    setParsed(null);
    setResult(null);
    setError(null);
  };

  return (
    <ScrollArea className="h-full">
      <div className="max-w-2xl mx-auto px-5 py-6">
        {/* 页头 */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-stone-800 flex items-center gap-2">
            <Database className="w-5 h-5 text-green-600" />
            数据贡献中心
          </h1>
          <p className="text-sm text-stone-500 mt-1">
            你的真实填报数据（匿名）帮助 Moirca 的推荐越来越准
          </p>
        </div>

        {/* 统计卡片 */}
        {stats && (
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="p-3 rounded-xl bg-white border border-stone-200 text-center">
              <div className="text-2xl font-bold text-indigo-600">{stats.total}</div>
              <div className="text-[11px] text-stone-400 mt-0.5">总贡献数</div>
            </div>
            <div className="p-3 rounded-xl bg-white border border-stone-200 text-center">
              <div className="text-2xl font-bold text-green-600">{stats.verified}</div>
              <div className="text-[11px] text-stone-400 mt-0.5">已验证</div>
            </div>
            <div className="p-3 rounded-xl bg-white border border-stone-200 text-center">
              <div className="text-2xl font-bold text-amber-600">{stats.verification_rate}%</div>
              <div className="text-[11px] text-stone-400 mt-0.5">通过率</div>
            </div>
          </div>
        )}

        {/* 输入区 */}
        <div className="rounded-xl bg-white border border-stone-200 p-4 mb-4">
          <h2 className="text-sm font-semibold text-stone-700 mb-2 flex items-center gap-1.5">
            <Upload className="w-4 h-4 text-stone-400" />
            提交新数据
          </h2>

          <div className="flex gap-2 mb-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handlePaste}
              className="text-xs h-7 gap-1"
            >
              <ClipboardPaste className="w-3 h-3" />
              从剪贴板读取
            </Button>
          </div>

          <Textarea
            placeholder="粘贴油猴脚本导出的 JSON 数据..."
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            className="min-h-[100px] text-xs font-mono"
          />

          <div className="flex gap-2 mt-2">
            <Button size="sm" onClick={handleParse} className="text-xs h-7 gap-1">
              解析数据
            </Button>
            <Button size="sm" variant="ghost" onClick={handleClear} className="text-xs h-7 gap-1">
              <Trash2 className="w-3 h-3" />
              清空
            </Button>
          </div>
        </div>

        {/* 解析预览 */}
        {parsed && (
          <div className="rounded-xl bg-white border border-amber-200 bg-amber-50/30 p-4 mb-4">
            <h3 className="text-sm font-semibold text-amber-800 mb-2">📋 数据预览</h3>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary" className="bg-amber-100 text-amber-700 border-amber-300">
                <MapPin className="w-3 h-3 mr-1" />
                {parsed.province}
              </Badge>
              <Badge variant="secondary" className="bg-amber-100 text-amber-700 border-amber-300">
                {parsed.volunteers.length} 条志愿
              </Badge>
              {parsed.user_profile?.score && (
                <Badge variant="secondary" className="bg-amber-100 text-amber-700 border-amber-300">
                  {parsed.user_profile.score} 分
                </Badge>
              )}
            </div>

            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={submitting}
              className="mt-3 text-xs h-7 gap-1 bg-green-600 hover:bg-green-700"
            >
              {submitting ? '提交中...' : '✅ 提交贡献 (匿名)'}
            </Button>
          </div>
        )}

        {/* 结果反馈 */}
        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-xl bg-green-50 border border-green-200 p-4 mb-4"
            >
              <div className="flex items-center gap-2 text-green-700 font-semibold text-sm">
                <Check className="w-4 h-4" />
                贡献成功！
              </div>
              <p className="text-xs text-green-600 mt-1">
                已接受 {result.accepted} 条数据，{result.verified} 条通过验证
                {result.rejected > 0 && `，${result.rejected} 条重复跳过`}
              </p>
              {result.cross_check_summary && (
                <p className="text-xs text-green-600/70 mt-0.5">{result.cross_check_summary}</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* 错误 */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs mb-4">
            <AlertTriangle className="w-3.5 h-3.5" />
            {error}
          </div>
        )}

        <Separator className="mb-4" />

        {/* 贡献历史 */}
        <div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-2 text-sm font-semibold text-stone-700 hover:text-stone-900 transition-colors"
          >
            <Clock className="w-4 h-4 text-stone-400" />
            贡献历史
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{history.length}</Badge>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showHistory ? 'rotate-180' : ''}`} />
          </button>

          {showHistory && (
            <div className="mt-2 space-y-1.5">
              {history.length === 0 ? (
                <p className="text-xs text-stone-400 py-4 text-center">暂无贡献记录</p>
              ) : (
                history.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 p-2.5 rounded-lg bg-white border border-stone-100 text-xs"
                  >
                    <div className="w-7 h-7 rounded-full bg-stone-100 flex items-center justify-center shrink-0">
                      {item.verified ? '✅' : '⏳'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-stone-700 truncate">
                        {item.province} · {item.school}
                      </div>
                      <div className="text-stone-400 text-[11px]">
                        {item.first_major && `${item.first_major} · `}
                        {item.created_at?.slice(0, 10)}
                      </div>
                    </div>
                    {item.verified && (
                      <ShieldCheck className="w-3.5 h-3.5 text-green-500 shrink-0" />
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* 隐私声明 */}
        <div className="mt-6 p-3 rounded-lg bg-stone-50 border border-stone-100">
          <p className="text-[10px] text-stone-400 leading-relaxed">
            <strong>🔒 隐私承诺：</strong>所有贡献数据为匿名处理，不与任何个人信息关联。
            数据仅用于改进 Moirca 的推荐算法（Agent 4 交叉验证 + Agent 6 融合计算）。
            我们不会将你的数据出售或分享给第三方。
          </p>
        </div>
      </div>
    </ScrollArea>
  );
}
