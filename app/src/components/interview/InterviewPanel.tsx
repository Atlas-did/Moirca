import { useMemo, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { motion } from 'framer-motion';
import { MessageCircleQuestion, Send, RefreshCw, UserRound } from 'lucide-react';
import { askInterview } from '@/api/interview';

const AGENTS = [
  { id: 'master', name: '主控 Agent' },
  { id: 'zhang', name: '张雪峰 Agent' },
  { id: 'parents', name: '爸妈 Agent' },
  { id: 'senior', name: '学长 Agent' },
  { id: 'workplace', name: '职场 Agent' },
  { id: 'data', name: '数据 Agent' },
  { id: 'risk', name: '风险 Agent' },
];

export default function InterviewPanel() {
  const { state } = useApp();
  const [agentName, setAgentName] = useState('master');
  const [question, setQuestion] = useState('这个推荐为什么这样排？');
  const [answer, setAnswer] = useState('');
  const [followUps, setFollowUps] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const context = useMemo(() => ({
    recommendMeta: state.recommendMeta,
    activeDocument: state.uploadResults.find(item => item.documentId === state.activeDocumentId) || null,
    activeReportId: state.activeReportId,
    selectedSchoolId: state.selectedSchoolId,
    selectedNodeId: state.selectedNodeId,
  }), [state]);

  const handleAsk = async () => {
    if (!question.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await askInterview({ agent_name: agentName, question, context });
      setAnswer(res.answer);
      setFollowUps(res.follow_ups || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '采访失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="h-10 shrink-0 px-3 border-b border-slate-200 flex items-center justify-between bg-white">
        <div className="flex items-center gap-2 text-slate-700">
          <MessageCircleQuestion className="w-4 h-4 text-blue-500" />
          <span className="text-sm font-medium">Agent 采访 / 问卷</span>
        </div>
      </div>

      <div className="p-3 border-b border-slate-200 bg-white space-y-3">
        <div>
          <div className="text-xs text-slate-500 mb-1">选择 Agent</div>
          <div className="flex flex-wrap gap-2">
            {AGENTS.map(agent => (
              <button
                key={agent.id}
                onClick={() => setAgentName(agent.id)}
                className={`px-2.5 py-1 rounded-full text-xs transition-colors ${agentName === agent.id ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {agent.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-xs text-slate-500 mb-1">问题</div>
          <textarea
            value={question}
            onChange={e => setQuestion(e.target.value)}
            className="w-full min-h-24 rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            placeholder="输入要追问的问题"
          />
        </div>

        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={handleAsk}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50"
        >
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          发起采访
        </motion.button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-center gap-2 mb-2 text-slate-700">
            <UserRound className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-medium">上下文快照</span>
          </div>
          <div className="text-xs text-slate-500 space-y-1">
            <div>推荐：{state.recommendMeta ? '已生成' : '未生成'}</div>
            <div>文档：{state.activeDocumentId ? '已绑定上传文档' : '无'}</div>
            <div>报告：{state.activeReportId || '无'}</div>
          </div>
        </div>

        {error && <div className="text-xs text-red-500">{error}</div>}

        {answer && (
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-xs font-medium text-slate-500 mb-2">回答</div>
            <div className="text-sm leading-7 text-slate-700 whitespace-pre-wrap">{answer}</div>
          </div>
        )}

        {followUps.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-xs font-medium text-slate-500 mb-2">继续追问</div>
            <div className="space-y-2">
              {followUps.map((item, idx) => (
                <button key={idx} onClick={() => setQuestion(item)} className="w-full text-left text-xs px-3 py-2 rounded-lg bg-slate-50 hover:bg-blue-50 text-slate-700">
                  {item}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
