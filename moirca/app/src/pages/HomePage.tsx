import { useEffect, useRef, useState, useCallback } from 'react';
import { useApp } from '@/contexts/AppContext';
import gsap from 'gsap';
import { Sparkles, GitCompareArrows, History, Settings } from 'lucide-react';

const PROVINCES = ['广东','北京','上海','浙江','江苏','湖北','湖南','四川','山东','河南','河北','安徽','福建','江西','辽宁','陕西','重庆','天津','云南','广西','山西','贵州','吉林','黑龙江','甘肃','内蒙古','新疆','海南','宁夏','青海','西藏'];
const SUBJECTS = ['物理类', '历史类'];

const FEATURES = [
  { icon: <Sparkles className="w-6 h-6" />, label: '智能推荐', desc: '多 Agent 协同分析', bg: '#EEF2FF', fg: '#4338CA' },
  { icon: <GitCompareArrows className="w-6 h-6" />, label: '对比分析', desc: '院校专业横向对比', bg: '#FEF3C7', fg: '#B45309' },
  { icon: <History className="w-6 h-6" />, label: '历史记录', desc: '查看历史分析方案', bg: '#D1FAE5', fg: '#047857' },
  { icon: <Settings className="w-6 h-6" />, label: '个人设置', desc: '偏好与账号管理', bg: '#FFE4E6', fg: '#BE123C' },
];

export default function HomePage() {
  const { dispatch } = useApp();
  const [score, setScore] = useState('');
  const [province, setProvince] = useState('广东');
  const [subject, setSubject] = useState('物理类');
  const [rank, setRank] = useState('');

  const heroRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const taglineRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    gsap.set(heroRef.current, { opacity: 0, y: -24 });
    gsap.set(taglineRef.current, { opacity: 0, y: 15 });
    gsap.set(inputRef.current, { opacity: 0, y: 25, scale: 0.96 });
    gsap.set(cardsRef.current?.children || [], { opacity: 0, y: 30 });

    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    tl.to(heroRef.current, { opacity: 1, y: 0, duration: 0.7 })
      .to(taglineRef.current, { opacity: 1, y: 0, duration: 0.5 }, '-=0.3')
      .to(inputRef.current, { opacity: 1, y: 0, scale: 1, duration: 0.6 }, '-=0.3')
      .to(cardsRef.current?.children || [], { opacity: 1, y: 0, stagger: 0.12, duration: 0.5 }, '-=0.2');
  }, []);

  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const bgNodesRef = useRef<any[]>([]);

  // Background canvas render loop
  useEffect(() => {
    const canvas = bgCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    // Create ~60 floating nodes
    const TIER_COLORS = { '985': '#D97706', '211': '#2563EB', '双一流': '#7C3AED' };
    const eliteNames = [
      '北京大学','清华大学','复旦','上海交大','浙大','南大','中科大','哈工大','西安交大',
      '武汉大学','华中科技','中山大学','川大','南开','天津大学','山东大学','东南大学',
      '北航','北师大','国防科大','中国农大','中央民族','华东师大','大连理工','电子科大',
      '华南理工','湖南大学','重庆大学','西北工业','兰大','东北大学','郑州大学','新疆大学',
      '云南大学','西北农林','中国海洋',
    ];
    const nodes: any[] = eliteNames.map((name, i) => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      name,
      tier: i < 10 ? '985' : i < 30 ? '211' : '双一流',
      r: i < 10 ? 5 : 4,
    }));
    bgNodesRef.current = nodes;

    const EDGES = [
      [0,1],[0,2],[0,3],[1,4],[2,5],[3,6],[4,7],[5,8],
      [6,9],[7,10],[8,11],[9,12],[10,13],[11,14],[12,15],
    ];

    let raf: number;
    const animate = () => {
      const w = window.innerWidth, h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      // Edges
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = 'rgba(160,160,160,0.25)';
      for (const [a, b] of EDGES) {
        if (a >= nodes.length || b >= nodes.length) continue;
        ctx.beginPath();
        ctx.moveTo(nodes[a].x, nodes[a].y);
        ctx.lineTo(nodes[b].x, nodes[b].y);
        ctx.stroke();
      }

      // Particles
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        n.x += n.vx;
        n.y += n.vy;

        // Gentle center gravity + repulsion
        n.vx += (w / 2 - n.x) * 0.00003;
        n.vy += (h / 2 - n.y) * 0.00003;

        // Repulsion between nodes
        for (let j = i + 1; j < nodes.length; j++) {
          const o = nodes[j];
          const dx = n.x - o.x, dy = n.y - o.y;
          const dist = Math.max(1, Math.sqrt(dx*dx + dy*dy));
          if (dist < 200) {
            const f = 0.5 / dist;
            n.vx += dx / dist * f;
            n.vy += dy / dist * f;
            o.vx -= dx / dist * f;
            o.vy -= dy / dist * f;
          }
        }

        // Damping
        n.vx *= 0.995;
        n.vy *= 0.995;

        // Bounds
        if (n.x < 0) { n.x = 0; n.vx *= -0.5; }
        if (n.x > w) { n.x = w; n.vx *= -0.5; }
        if (n.y < 0) { n.y = 0; n.vy *= -0.5; }
        if (n.y > h) { n.y = h; n.vy *= -0.5; }

        // Draw
        const color = TIER_COLORS[n.tier] || '#999';
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = color + '55';
        ctx.fill();

        // Label for 985 only
        if (n.r >= 3) {
          ctx.font = 'bold 10px sans-serif';
          ctx.fillStyle = color + '50';
          ctx.textAlign = 'center';
          ctx.fillText(n.name, n.x, n.y - 10);
        }
      }

      raf = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  const handleStart = () => {
    if (score && parseInt(score) >= 100) {
      dispatch({ type: 'START_ANALYSIS', payload: { score, province, subject, rank } } as any);
    }
  };


  return (
    <div className="min-h-screen flex flex-col bg-white relative">
      <canvas ref={bgCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-0" />
      {/* Top Bar */}
      <header className="relative z-10 flex items-center justify-center px-10 py-6">
        <span className="text-lg font-bold text-stone-800 tracking-tight">Moirca</span>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 relative z-10">
        {/* Hero */}
        <div ref={heroRef} className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-5 py-1.5 bg-indigo-600 text-white rounded-full text-xs font-bold mb-6 shadow-md">
            <Sparkles className="w-3.5 h-3.5" />
            多 Agent AI 决策引擎
          </div>
          <h1 className="text-6xl sm:text-7xl font-extrabold text-stone-900 tracking-tight drop-shadow-sm">
            Moirca
          </h1>
          <p ref={taglineRef} className="mt-3 text-stone-600 text-base font-medium">
            不只看你能上什么——看你该不该上
          </p>
        </div>

        {/* Search Box */}
        <div ref={inputRef} className="w-full max-w-2xl mb-16">
          <div className="bg-white rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.12)] border border-stone-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 relative">
                <input
                  type="number"
                  value={score}
                  onChange={(e) => setScore(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleStart()}
                  placeholder="高考分数"
                  className="w-full h-14 pl-5 pr-3 text-xl bg-stone-100 border-2 border-stone-300 rounded-xl text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-600 transition-all font-bold"
                />
              </div>
              <input
                type="number"
                value={rank}
                onChange={(e) => setRank(e.target.value)}
                placeholder="位次（选填）"
                className="w-32 h-14 pl-4 pr-3 text-base bg-stone-100 border-2 border-stone-300 rounded-xl text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-600 transition-all font-bold"
              />
              <select
                value={province}
                onChange={(e) => setProvince(e.target.value)}
                className="h-14 px-4 bg-stone-100 border-2 border-stone-300 rounded-xl text-sm font-bold text-stone-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-600"
              >
                {PROVINCES.map((p) => <option key={p}>{p}</option>)}
              </select>
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="h-14 px-4 bg-stone-100 border-2 border-stone-300 rounded-xl text-sm font-bold text-stone-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-600"
              >
                {SUBJECTS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <button
              onClick={handleStart}
              disabled={!score || parseInt(score) < 100}
              className="w-full h-13 flex items-center justify-center gap-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-stone-300 disabled:text-stone-500 text-white rounded-xl text-base font-bold transition-all shadow-lg hover:shadow-xl active:scale-[0.98]"
            >
              <Sparkles className="w-5 h-5" />
              开始 AI 分析
            </button>
          </div>
        </div>

        {/* Feature Cards */}
        <div className="w-full max-w-3xl">
          <div ref={cardsRef} className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {FEATURES.map((f) => (
              <button
                key={f.label}
                onMouseEnter={(e) => { gsap.to(e.currentTarget, { y: -6, scale: 1.03, duration: 0.2, ease: 'power2.out' }); }}
                onMouseLeave={(e) => { gsap.to(e.currentTarget, { y: 0, scale: 1, duration: 0.2, ease: 'power2.out' }); }}
                
                className="group bg-white rounded-xl border border-stone-200 p-5 hover:shadow-xl hover:border-stone-300 transition-all text-center shadow-sm"
              >
                <div className="w-14 h-14 mx-auto mb-3 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-200 shadow-md border-2 border-white/50"
                  style={{ backgroundColor: f.bg, color: f.fg }}
                >
                  {f.icon}
                </div>
                <div className="text-sm font-bold text-stone-900">{f.label}</div>
                <div className="text-[11px] font-medium text-stone-500 mt-1">{f.desc}</div>
              </button>
            ))}
          </div>
        </div>
      </main>

      <footer className="text-center py-5 text-xs font-medium text-stone-500 relative z-10">
        数据仅供参考，请以各省教育考试院官方信息为准
      </footer>
    </div>
  );
}
