import { useApp } from '@/contexts/AppContext';
import { LogOut, User } from 'lucide-react';

export default function SettingsPanel() {
  const { state, dispatch } = useApp();

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* User Info */}
      <div className="bg-white rounded-xl border border-amber-100 p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-stone-700 mb-3">用户信息</h3>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
            <User className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-stone-700">{state.username}</p>
            <p className="text-xs text-stone-400">{state.isGuest ? '游客模式' : '已登录'}</p>
          </div>
        </div>
      </div>

      {/* About */}
      <div className="bg-white rounded-xl border border-amber-100 p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-stone-700 mb-3">关于 Moirca</h3>
        <p className="text-xs text-stone-500 leading-relaxed">
          Moirca 是一款基于多 Agent 协同的高考志愿 AI 推荐工具。
          通过 7 个专业 Agent 从不同视角分析，为你生成结构化的决策说明书。
        </p>
        <p className="text-xs text-stone-400 mt-3">v2.1 · 数据仅供参考，请以官方发布为准</p>
      </div>

      {/* Logout */}
      <button
        onClick={() => dispatch({ type: 'LOGOUT' })}
        className="flex items-center gap-2 px-4 py-2.5 text-sm text-stone-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
      >
        <LogOut className="w-4 h-4" />
        退出登录
      </button>
    </div>
  );
}
