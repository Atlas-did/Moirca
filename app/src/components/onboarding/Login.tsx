import { useState } from 'react';
import { motion } from 'framer-motion';
import { useApp } from '@/contexts/AppContext';
import { User, Sparkles } from 'lucide-react';

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
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #0c4a6e 0%, #1e40af 30%, #3b82f6 70%, #93c5fd 100%)' }}>

      {/* Animated background particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 20 }).map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full bg-white/10"
            style={{
              width: Math.random() * 8 + 4,
              height: Math.random() * 8 + 4,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
            }}
            animate={{
              y: [0, -30, 0],
              opacity: [0.2, 0.6, 0.2],
            }}
            transition={{
              duration: Math.random() * 3 + 2,
              repeat: Infinity,
              delay: Math.random() * 2,
            }}
          />
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md mx-4"
      >
        <div className="backdrop-blur-xl rounded-2xl p-8 border border-white/20"
          style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}>

          {/* Logo */}
          <div className="text-center mb-8">
            <motion.div
              className="w-20 h-20 mx-auto mb-4 rounded-2xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #3b82f6, #06b6d4)' }}
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ duration: 4, repeat: Infinity }}
            >
              <Sparkles className="w-10 h-10 text-white" />
            </motion.div>
            <h1 className="text-3xl font-bold text-white mb-2">Moirca 志愿助手</h1>
            <p className="text-blue-100 text-sm">多 Agent 协同 · 知识图谱 · AHP 智能决策</p>
          </div>

          {/* Input */}
          <div className="space-y-4">
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-200" />
              <input
                type="text"
                placeholder="输入用户名（可选）"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin(false)}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-white/20 bg-white/10 text-white placeholder-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all"
              />
            </div>

            {/* Login Buttons */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleLogin(false)}
              disabled={isLoading}
              className="w-full py-3 rounded-xl font-semibold text-white transition-all"
              style={{ background: 'linear-gradient(135deg, #3b82f6, #06b6d4)' }}
            >
              {isLoading ? '进入中...' : '开始使用'}
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleLogin(true)}
              disabled={isLoading}
              className="w-full py-3 rounded-xl font-medium text-blue-100 border border-white/20 hover:bg-white/10 transition-all"
            >
              游客模式体验
            </motion.button>
          </div>

          {/* Features */}
          <div className="mt-8 pt-6 border-t border-white/10">
            <div className="grid grid-cols-3 gap-4 text-center">
              {[
                { icon: '🧠', label: '6 大 Agent' },
                { icon: '📊', label: 'AHP 决策' },
                { icon: '🗺️', label: '知识图谱' },
              ].map((f) => (
                <div key={f.label} className="text-blue-100">
                  <div className="text-2xl mb-1">{f.icon}</div>
                  <div className="text-xs">{f.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <p className="text-center text-blue-200/60 text-xs mt-4">
          数据仅供参考，请以官方发布为准
        </p>
      </motion.div>
    </div>
  );
}
