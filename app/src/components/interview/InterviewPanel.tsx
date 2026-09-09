import { useMemo, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { motion } from 'framer-motion';
import { MessageCircleQuestion, Send, RefreshCw } from 'lucide-react';
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
    <div className="h-full flex flex-col bg-card">
      <div className="h-10 shrink-0 px-3 border-b border-border flex items-center justify-between bg-card">
        <div className="flex items-center gap-2 text-foreground">
          <MessageCircleQuestion className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Agent 采访 / 问卷</span>
        </div>
      </div>

      <div className="p-4 border-b border-border bg-card space-y-3">
        <div>
          <div className="text-xs text-muted-foreground mb-1.5">选择 Agent</div>
          <div className="flex flex-wrap gap-2">
            {AGENTS.map(agent => (
              <button
                key={agent.id}
                onClick={() => setAgentName(agent.id)}
                className={`rounded-sm px-2.5 py-1 text-xs transition-colors ${agentName === agent.id ? 'bg-primary text-primary-foreground' : 'border border-border bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground'}`}
              >
                {agent.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-xs text-muted-foreground mb-1.5">问题</div>
          <textarea
            value={question}
            onChange={e => setQuestion(e.target.value)}
            className="w-full min-h-24 rounded-md border border-input bg-card px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 transition-colors"
            placeholder="输入要追问的问题"
          />
        </div>

        <motion.button
          onClick={handleAsk}
          disabled={loading}
          className="w-full h-9 flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground text-[13px] font-medium hover:bg-primary/90 shadow-xs transition-colors disabled:opacity-50"
        >
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          发起采访
        </motion.button>
      </div>

      <div className="flex-1 overflow-y-auto thin-scrollbar p-4">
        {/* 上下文快照(hairline 分区,dl 键值行) */}
        <div>
          <div className="eyebrow mb-1">上下文快照</div>
          <div className="text-xs">
            <div className="flex justify-between border-b border-border/50 py-1.5"><span className="text-muted-foreground">推荐</span><span className="tabular-nums text-foreground">{state.recommendMeta ? '已生成' : '未生成'}</span></div>
            <div className="flex justify-between border-b border-border/50 py-1.5"><span className="text-muted-foreground">文档</span><span className="text-foreground">{state.activeDocumentId ? '已绑定上传文档' : '无'}</span></div>
            <div className="flex justify-between py-1.5"><span className="text-muted-foreground">报告</span><span className="tabular-nums text-foreground truncate ml-4">{state.activeReportId || '无'}</span></div>
          </div>
        </div>

        {error && <div className="mt-3 text-xs text-destructive">{error}</div>}

        {answer && (
          <>
            <div className="hr-hairline my-3" />
            <div>
              <div className="eyebrow mb-1.5">回答</div>
              <div className="text-[13px] leading-[1.75] text-foreground whitespace-pre-wrap">{answer}</div>
            </div>
          </>
        )}

        {followUps.length > 0 && (
          <>
            <div className="hr-hairline my-3" />
            <div>
              <div className="eyebrow mb-1">继续追问</div>
              <div className="divide-y divide-border">
                {followUps.map((item, idx) => (
                  <button key={idx} onClick={() => setQuestion(item)} className="list-row h-9 w-full text-left text-xs text-muted-foreground hover:text-foreground">
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
