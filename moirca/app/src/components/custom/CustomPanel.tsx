import { useState, useRef, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Loader2, ThumbsUp, User, MessageSquare, Send, GripVertical } from 'lucide-react';

const QUESTIONS = [
  { id: 'career', text: '毕业后你想干什么？', options: ['就业赚钱', '考公/考编', '考研深造', '留学', '自己创业'] },
  { id: 'company', text: '如果就业，最想去什么类型的公司？', options: ['大厂/外企', '国企/央企', '中小企业', '自由职业', '还没想好'] },
  { id: 'midlife', text: '你对"35岁危机"怎么看？', options: ['很焦虑，想找稳定工作', '能接受，趁年轻多赚钱', '没想过', '相信自己不会被淘汰'] },
  { id: 'budget', text: '家庭的学费承受能力？', options: ['宽裕（10万+/年）', '一般（5万左右）', '紧张（越低越好）'] },
  { id: 'connection', text: '家里有人脉资源帮你找工作吗？', options: ['有（体制内/行业内）', '没有', '不确定'] },
  { id: 'family_expect', text: '家里对你的期望是？', options: ['稳定体面', '赚大钱', '做自己喜欢的事就行', '别管我'] },
  { id: 'social', text: '你的性格偏向？', options: ['喜欢跟人打交道', '喜欢独处研究', '两者皆可'] },
  { id: 'pace', text: '你是卷王还是躺平派？', options: ['卷王，想冲', '中间，看情况', '躺平，够用就行'] },
  { id: 'decision', text: '你做决定的方式是？', options: ['自己拿主意', '听爸妈的', '问朋友/老师', '看网上评价'] },
  { id: 'job_pref', text: '如果薪资一样，你选哪个工作？', options: ['体制内铁饭碗', '大公司螺丝钉', '小公司成长快', '自己干'] },
  { id: 'region', text: '想去哪里读大学？', options: ['不出省', '省内优先', '全国都可以', '离家越远越好'] },
  { id: 'city_circle', text: '优先考虑哪个城市圈？', options: ['京津冀/北京', '长三角/上海杭州', '珠三角/深圳广州', '成渝', '中西部', '无所谓'] },
  { id: 'small_city', text: '能接受去县城或小城市工作几年吗？', options: ['可以', '完全不想', '看机会'] },
  { id: 'work_value', text: '你最看重工作的什么？', options: ['薪资高', '稳定', '成就感', '自由/不坐班'] },
  { id: 'college_value', text: '你觉得大学四年最重要的是？', options: ['学历/文凭', '学到真本事', '积累人脉', '谈恋爱/玩'] },
  { id: 'school_priority', text: '选学校你更看中什么？', options: ['学校名气', '专业实力', '城市好', '就业率高'] },
  { id: 'risk', text: '你是冒险型还是求稳型？', options: ['高风险高回报', '中等风险', '一定要稳'] },
  { id: 'skill', text: '你更擅长什么？', options: ['数理/逻辑', '语言/表达', '动手/实操', '人际/沟通'] },
  { id: 'income_expect', text: '你对未来的预期收入？', options: ['月入1万就够', '1-2万', '2万以上', '能活下去就行'] },
  { id: 'ai_anxiety', text: '对AI替代工作的焦虑程度？', options: ['很担心', '一般', '不担心', 'AI是机会不是威胁'] },
  { id: 'industry', text: '你更看好未来什么方向？', options: ['AI/芯片', '新能源/环保', '医疗/养老', '金融', '互联网'] },
  { id: 'overtime', text: '你对加班的容忍度？', options: ['完全不行', '偶尔可以', '经常加也行', '为了钱可以'] },
  { id: 'living', text: '毕业后打算和父母住还是自己住？', options: ['和父母住', '自己住', '看城市'] },
  { id: 'tech_type', text: '你觉得你属于哪种类型？', options: ['技术型（靠技术吃饭）', '社交型（靠人脉吃饭）', '管理型（想带团队）', '自由型（不想被管）'] },
  { id: 'exclude', text: '有没有打死不想学/不想干的？', options: ['医学/护理', '师范/教育', '农林地矿', '生化环材', '计算机', '没有特别排斥'] },
];

const AGENTS = [
  { id: 'zhang', name: '张雪峰老师', emoji: '👨‍🏫', color: '#D97706' },
  { id: 'data', name: '数据分析', emoji: '📊', color: '#2563EB' },
  { id: 'risk', name: '风险预警', emoji: '⚠️', color: '#DC2626' },
];

interface Message { agentId: string; agentName: string; content: string; isUser?: boolean }

export default function CustomPanel() {
  const { state, dispatch } = useApp();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<Message[]>([]);
  const [chalIdx, setChalIdx] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [userText, setUserText] = useState('');
  const [customAnswer, setCustomAnswer] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [progress, setProgress] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const calledRef = useRef(false);
  const resizeRef = useRef<{ startX: number; startW: number } | null>(null);
  const [panelWidth, setPanelWidth] = useState(500);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      const dx = resizeRef.current.startX - e.clientX;
      setPanelWidth(Math.max(350, Math.min(800, resizeRef.current.startW + dx)));
    };
    const onUp = () => { resizeRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const cp = (state as any).customPhase;
  const isActive = cp !== 'idle';
  const profile = Object.entries(answers).map(([k, v]) => `${QUESTIONS.find(q => q.id === k)?.text} → ${v}`).join('；');

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight || 0; }, [messages, loading]);

  useEffect(() => {
    if (cp !== 'filtering') return;
    if (state.draftPlan.summary?.generated) return;

    const doSummarize = async () => {
      try {
        const hi = (state as any).homeInput || {};
        const res = await fetch('/api/chat/summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profile: {
              score: hi.score || '',
              province: hi.province || '',
              subject: hi.subject || '',
              rank: hi.rank || '',
            },
            messages: messages.map(m => ({
              agentId: m.agentId,
              agentName: m.agentName,
              content: m.content,
            })),
            decisions: state.draftPlan.entries
              .filter(e => e.type === 'decision')
              .map(e => e.content),
          }),
        });
        const data = await res.json();
        dispatch({
          type: 'UPDATE_DRAFT_PLAN',
          payload: { summary: { ...data, generated: true } },
        } as any);
      } catch {}
    };

    doSummarize();
  }, [cp]);

  const callAgent = async (agentId: string, message: string, onChunk?: (text: string) => void) => {
    try {
      const pollRes = await fetch('/api/chat/poll', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, agent_id: agentId }),
      });
      const { task_id } = await pollRes.json();
      if (!task_id) return '';
      let result: any = null;
      while (true) {
        await new Promise(r => setTimeout(r, 800));
        const checkRes = await fetch(`/api/chat/poll/${task_id}`);
        result = await checkRes.json();
        if (result.partial_reply && onChunk) {
          onChunk(result.partial_reply);
        } else if (result.status === 'processing' && onChunk) {
          onChunk('思考中...');
        }
        if (result.status === 'done' || result.status === 'error') {
          break;
        }
      }
      const fullText = result.reply || '';
      if (onChunk && !result.partial_reply) onChunk(fullText);
      return fullText;
    } catch { return ''; }
  };

  const updateMatch = (zhangReply?: string) => {
    const text = zhangReply || messages.filter(m => m.agentId === 'zhang').pop()?.content || '';
    if (!text) return;
    const schoolPattern = /([\u4e00-\u9fa5]{2,8}(?:大学|学院))(?![\u4e00-\u9fa5])/g;
    const mentioned = [...new Set(Array.from(text.matchAll(schoolPattern), m => m[1]))];
    const graphSchools = (state.graphNodes || []).filter((n: any) => n.type === 'school');
    const matchedIds = mentioned
      .map(name => graphSchools.find((s: any) =>
        s.label === name || name.includes(s.label) || s.label.includes(name)
      ))
      .filter(Boolean)
      .map((s: any) => s.id);
    dispatch({ type: 'SET_MATCHED_SCHOOLS', payload: [...new Set(matchedIds)] } as any);
  };

  const handleAnswer = async (qId: string, answer: string) => {
    const na = { ...answers, [qId]: answer };
    setAnswers(na);
    setCustomAnswer('');
    if (step < QUESTIONS.length - 1) { setStep(step + 1); return; }

    const hi = (state as any).homeInput || {};
    const profileJson = {
      score: hi.score || '未知',
      province: hi.province || '未知',
      subject: hi.subject || '未知',
      rank: hi.rank || '未知',
      answers: QUESTIONS.map(q => ({ question: q.text, answer: na[q.id] || '未答' })),
    };

    dispatch({ type: 'UPDATE_DRAFT_PLAN', payload: {
      profile: { score: hi.score || '', province: hi.province || '', subject: hi.subject || '', rank: hi.rank || '' },
      answers: QUESTIONS.map(q => ({ question: q.text, answer: na[q.id] || '未答' })),
    } as any });

    dispatch({ type: 'SET_CUSTOM_PHASE', payload: 'thinking' } as any);
    setLoading(true);
    setStreamingText('');
    setProgress(2);

    const timer = setInterval(() => setProgress(p => Math.min(p + 2, 98)), 600);

    const reply = await callAgent('zhang',
      `以下是考生的完整画像，分数/排位/省份/选科全部已确认，不要再问任何问题，直接给出详细的志愿分析建议：\n${JSON.stringify(profileJson, null, 2)}`,
      (text) => setStreamingText(text)
    );

    clearInterval(timer);
    setProgress(100);
    setMessages([{ agentId: 'zhang', agentName: '张雪峰老师', content: reply }]);

    const excerpt = reply.replace(/<think>[\s\S]*?<\/think>/g, '').trim().slice(0, 120);
    dispatch({ type: 'UPDATE_DRAFT_PLAN', payload: {
      appendEntry: { type: 'direction', source: '张雪峰老师', content: excerpt || '已生成分析' },
    } as any });

    updateMatch(reply);
    dispatch({ type: 'SET_CUSTOM_PHASE', payload: 'debating' } as any);
    setLoading(false);
    setChalIdx(0);
    nextChallenger(0, reply, profileJson);
  };

  const nextChallenger = async (idx: number, zhangReply: string, profile?: Record<string, unknown>) => {
    if (idx >= AGENTS.length - 1) {
      dispatch({ type: 'SET_CUSTOM_PHASE', payload: 'filtering' } as any);
      return;
    }
    setChalIdx(idx);
    setLoading(true);
    const a = AGENTS[idx + 1];
    const profileStr = profile ? JSON.stringify(profile) : (state as any).userProfile ? JSON.stringify((state as any).userProfile) : '';
    const dataMsg = a.id === 'data'
      ? `${profileStr}\n\n张雪峰策略：\n「${zhangReply}」\n\n请逐校分析以上院校列表。`
      : `你是${a.name}。用户画像：${profileStr}\n\n张雪峰老师给出以下分析：\n「${zhangReply}」\n请从你的专业角度质疑或补充，至少120字。指出可能忽略的点或给不同的视角。`;
    const reply = await callAgent(a.id, dataMsg);
    setMessages(prev => [...prev, { agentId: a.id, agentName: a.name, content: reply }]);
    const ex = reply.replace(/<think>[\s\S]*?<\/think>/g, '').trim().slice(0, 100);
    const entryType = a.id === 'risk' ? 'warning' as const : 'direction' as const;
    dispatch({ type: 'UPDATE_DRAFT_PLAN', payload: {
      appendEntry: { type: entryType, source: a.name, content: ex || '已响应' },
    } as any });
    setLoading(false);
  };

  const handleVote = async (side: 'zhang' | 'challenger') => {
    const a = AGENTS[chalIdx + 1];
    const chalMsg = messages.filter(m => m.agentId === a.id).pop()?.content || '';
    const lastZhang = messages.filter(m => m.agentId === 'zhang').pop()?.content || '';
    const hi = (state as any).homeInput || {};
    const scoreInfo = hi.score ? `（高考${hi.score}分·${hi.province || ''}·${hi.subject || ''}）` : '';

    dispatch({ type: 'UPDATE_DRAFT_PLAN', payload: {
      appendEntry: { type: 'decision', source: '你的选择', content: side === 'zhang' ? `倾向张雪峰老师的观点（第${chalIdx + 1}轮）` : `采纳${a.name}的建议（第${chalIdx + 1}轮）` },
    } as any });

    if (side === 'zhang') {
      if (chalMsg) {
        const rebut = await callAgent('zhang',
          `${scoreInfo}以下是${a.name}的质疑：「${chalMsg}」。请回应这个质疑，维护你的观点。不超过150字。`);
        setMessages(prev => [...prev, { agentId: 'zhang', agentName: '张雪峰老师', content: rebut }]);
        updateMatch();
        const nextI = chalIdx + 1;
        setTimeout(() => nextChallenger(nextI, rebut), 200);
      } else {
        updateMatch();
        setTimeout(() => nextChallenger(chalIdx + 1, lastZhang), 200);
      }
    } else {
      const revision = await callAgent('zhang',
        `${scoreInfo}请吸收${a.name}的观点：「${chalMsg}」，重新给出优化后的志愿方案。不超过200字。`);
      setMessages(prev => [...prev, { agentId: 'zhang', agentName: '张雪峰老师', content: revision }]);
      updateMatch();
      setTimeout(() => nextChallenger(chalIdx + 1, revision), 200);
    }
  };

  const handleCustomInput = async () => {
    if (!userText.trim()) return;
    setMessages(prev => [...prev, { agentId: 'user', agentName: '你的观点', content: userText, isUser: true }]);
    const input = userText;
    setUserText('');
    setLoading(true);
    dispatch({ type: 'UPDATE_DRAFT_PLAN', payload: {
      appendEntry: { type: 'decision', source: '你的补充', content: input.slice(0, 100) },
    } as any });
    const hi2 = (state as any).homeInput || {};
    const sci = hi2.score ? `（高考${hi2.score}分·${hi2.province || ''}）` : '';
    const reply = await callAgent('zhang', `${sci}用户提出了自己的看法：「${input}」。请结合之前的讨论，更新你的志愿推荐方案。不超过200字。`);
    setMessages(prev => [...prev, { agentId: 'zhang', agentName: '张雪峰老师', content: reply }]);
    updateMatch();
    setLoading(false);
  };

  if (!isActive) return null;

  const showDebate = cp === 'debating' || cp === 'filtering';
  const showProfileQs = cp === 'asking' && step < QUESTIONS.length;

  return (
    <div className="flex shrink-0">
      <div
        className="w-[6px] cursor-col-resize hover:bg-indigo-400 active:bg-indigo-500 transition-colors shrink-0 flex items-center justify-center group bg-stone-100"
        onMouseDown={(e) => {
          resizeRef.current = { startX: e.clientX, startW: panelWidth };
          e.preventDefault();
        }}
      >
        <GripVertical className="w-3 h-3 text-stone-400 group-hover:text-white opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="flex flex-col bg-white border-l border-stone-200 overflow-hidden"
        style={{ width: panelWidth }}
      >
      <div className="px-5 py-3.5 border-b border-stone-100 bg-white flex items-center gap-2.5 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <div>
          <div className="text-sm font-bold text-stone-800">定制志愿分析</div>
          <div className="text-[10px] text-stone-400">
            {cp === 'asking' && '回答几个简单问题'}
            {cp === 'thinking' && '张雪峰老师分析中'}
            {cp === 'debating' && `第 ${chalIdx + 1}/${AGENTS.length - 1} 轮质询`}
            {cp === 'filtering' && '质询完成'}
          </div>
        </div>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-amber-500 ml-auto" />}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto px-5 py-4 space-y-4">
        {cp === 'asking' && showProfileQs && (
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
              <div className="text-xs font-bold text-stone-400 uppercase tracking-[0.15em]">问题 {step + 1} / {QUESTIONS.length}</div>
              <h2 className="text-xl font-extrabold text-stone-800 tracking-tight leading-snug">{QUESTIONS[step].text}</h2>
              <div className="space-y-2.5">
                {QUESTIONS[step].options.map(opt => (
                  <button key={opt} onClick={() => handleAnswer(QUESTIONS[step].id, opt)}
                    className="w-full text-left px-5 py-3.5 rounded-2xl border-2 border-stone-200 text-base font-medium text-stone-700 hover:border-indigo-400 hover:bg-indigo-50/30 transition-all hover:shadow-md">
                    {opt}
                  </button>
                ))}
              </div>
              <div className="pt-2">
                <div className="text-[11px] text-stone-400 mb-2 text-center">—— 或输入你的想法 ——</div>
                <div className="flex gap-2">
                  <input value={customAnswer} onChange={e => setCustomAnswer(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && customAnswer.trim() && handleAnswer(QUESTIONS[step].id, customAnswer.trim())}
                    placeholder="输入你的答案..."
                    className="flex-1 px-4 py-2.5 text-sm border border-stone-200 rounded-xl focus:outline-none focus:border-indigo-400" />
                  <button onClick={() => customAnswer.trim() && handleAnswer(QUESTIONS[step].id, customAnswer.trim())}
                    className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700">
                    确定
                  </button>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        )}

        {cp === 'thinking' && (
          <div className="space-y-4 border-4 border-indigo-500 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-indigo-500 rounded-full animate-ping" />
              <span className="text-sm font-extrabold text-indigo-700">张雪峰老师正在分析你的情况</span>
              <span className="text-xs text-indigo-400 ml-auto font-mono">{progress}%</span>
            </div>
            <div className="h-3 bg-indigo-100 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-600 rounded-full transition-all duration-300" style={{width:`${progress}%`}} />
            </div>
            {streamingText ? (
              <div className="bg-white border-2 border-indigo-200 rounded-xl p-4 max-h-[500px] overflow-auto">
                <pre className="text-sm text-stone-700 whitespace-pre-wrap font-sans leading-relaxed">{streamingText}</pre>
              </div>
            ) : (
              <div className="text-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-400 mx-auto mb-2" />
                <p className="text-sm text-indigo-400">正在等待张雪峰老师回复...</p>
              </div>
            )}
          </div>
        )}

        {showDebate && messages.map((msg, i) => {
          const ag = AGENTS.find(a => a.id === msg.agentId);
          return (
            <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className={`flex gap-3 ${msg.isUser ? 'flex-row-reverse' : ''}`}>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm shrink-0"
                style={{ backgroundColor: msg.isUser ? '#44403C' : (ag?.color || '#999') + '18', color: ag?.color || '#999' }}>
                {msg.isUser ? <User className="w-4 h-4 text-white" /> : (ag?.emoji || '🤖')}
              </div>
              <div className={`flex-1 min-w-0 ${msg.isUser ? 'text-right' : ''}`}>
                <div className="text-[11px] font-bold text-stone-500 mb-1">{msg.isUser ? '你的观点' : msg.agentName}</div>
                <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${msg.isUser ? 'bg-stone-700 text-white' : 'bg-stone-50 border border-stone-100'}`}>
                  {msg.content}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {cp === 'debating' && !loading && chalIdx < AGENTS.length - 1 && (
        <div className="px-5 py-4 border-t border-stone-100 shrink-0 space-y-3">
          <div className="text-[11px] font-bold text-stone-400 uppercase tracking-wider text-center">
            {AGENTS[chalIdx + 1]?.name} 提出质疑 — 你更倾向谁？
          </div>
          <div className="flex gap-2">
            <button onClick={() => handleVote('zhang')}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-50 border-2 border-amber-200 text-amber-800 font-bold text-sm hover:bg-amber-100 transition-all">
              <ThumbsUp className="w-4 h-4" /> 听张雪峰的
            </button>
            <button onClick={() => handleVote('challenger')}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-stone-50 border-2 border-stone-200 text-stone-600 font-bold text-sm hover:bg-stone-100 transition-all">
              <ThumbsUp className="w-4 h-4" /> 听{AGENTS[chalIdx + 1]?.name}的
            </button>
          </div>
          <div className="flex gap-2">
            <input value={userText} onChange={e => setUserText(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCustomInput()}
              placeholder="或输入你的想法..."
              className="flex-1 px-4 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:border-indigo-400" />
            <button onClick={handleCustomInput}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 flex items-center gap-1">
              <Send className="w-3.5 h-3.5" /> 发送
            </button>
          </div>
        </div>
      )}

      {cp === 'filtering' && (
        <div className="px-5 py-4 border-t border-stone-100 shrink-0 flex gap-2">
          <button onClick={() => dispatch({ type: 'SET_CUSTOM_PHASE', payload: 'confirm' } as any)}
            className="flex-1 bg-emerald-600 text-white rounded-xl py-2.5 text-sm font-bold hover:bg-emerald-700">确认方案</button>
          <button onClick={() => { setStep(0); setAnswers({}); setMessages([]); setChalIdx(-1); dispatch({ type: 'SET_MATCHED_SCHOOLS', payload: [] } as any); dispatch({ type: 'SET_CUSTOM_PHASE', payload: 'idle' } as any); }}
            className="flex-1 bg-stone-100 text-stone-600 rounded-xl py-2.5 text-sm font-medium hover:bg-stone-200">重新来</button>
        </div>
      )}
    </motion.div>
    </div>
  );
}
