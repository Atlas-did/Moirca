import { useState } from 'react';
import { motion } from 'framer-motion';
import { useApp } from '@/contexts/AppContext';
import { User, Brain, BarChart3, Share2 } from 'lucide-react';

export default function Login() {
  const { dispatch } = useApp();
  const [username, setUsername] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = (isGuest: boolean) => {
    setIsLoading(true);
    setTimeout(() => {
      dispatch({
        type: 'LOGIN',
        payload: { username: isGuest ? '游客' : username || '用户', isGuest },
      });
      setIsLoading(false);
    }, 600);
  };

  return (
    <div className="min-h-screen h-full flex items-center justify-center relative overflow-hidden bg-background">
      {/* 背景纹理:primary 4% 径向光晕 + 2% 细网格(规范 v2 §5.1,静态克制) */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 38%, hsl(var(--primary) / 0.04), transparent 70%)',
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(hsl(var(--foreground) / 0.02) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground) / 0.02) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="w-full max-w-md mx-4 relative z-10"
      >
        <div className="panel-card rounded-xl p-8">
          {/* 文档封面式左对齐页首:Logo 方印 + 标题 + 说明,不整体居中 */}
          <div className="mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 shrink-0 rounded-lg flex items-center justify-center bg-primary shadow-xs">
                <span className="text-lg font-semibold text-primary-foreground">M</span>
              </div>
              <div>
                <h1 className="text-lg font-semibold tracking-tight text-foreground">Moirca 志愿助手</h1>
                <p className="text-xs text-muted-foreground mt-0.5">多 Agent 协同 · 知识图谱 · AHP 智能决策</p>
              </div>
            </div>
            {/* 赭橙唯一点缀:标题下短横,左对齐 */}
            <div className="w-8 h-0.5 bg-[hsl(var(--chart-3))] rounded-sm mt-1 ml-[52px]" />
          </div>

          {/* Input */}
          <div className="space-y-3">
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="输入用户名（可选）"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin(false)}
                className="w-full h-10 pl-9 pr-4 rounded-md border border-input bg-card text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 transition-colors"
              />
            </div>

            {/* Login Buttons */}
            <motion.button
              onClick={() => handleLogin(false)}
              disabled={isLoading}
              className="w-full h-10 rounded-md font-medium text-[13px] bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs transition-colors disabled:opacity-50"
            >
              {isLoading ? '进入中...' : '开始使用'}
            </motion.button>

            <motion.button
              onClick={() => handleLogin(true)}
              disabled={isLoading}
              className="w-full h-10 rounded-md font-medium text-[13px] text-foreground border border-border bg-secondary hover:bg-accent transition-colors disabled:opacity-50"
            >
              游客模式体验
            </motion.button>
          </div>

          {/* Features:hairline 分隔三点式(无图标底座,v2 §5.1) */}
          <div className="mt-8 pt-6 border-t border-border">
            <div className="flex divide-x divide-border">
              {[
                { icon: Brain, label: '6 大 Agent' },
                { icon: BarChart3, label: 'AHP 决策' },
                { icon: Share2, label: '知识图谱' },
              ].map((f, i) => (
                <div key={f.label} className={`flex-1 pt-3 ${i === 0 ? '' : 'pl-3'}`}>
                  <div className="flex items-center justify-center gap-1.5">
                    <f.icon className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-[11px] text-muted-foreground">{f.label}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <p className="text-center text-muted-foreground/70 text-xs mt-4">
          数据仅供参考，请以官方发布为准
        </p>
      </motion.div>
    </div>
  );
}
