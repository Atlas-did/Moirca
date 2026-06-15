import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, BarChart3, MapPin, X, FileText } from 'lucide-react';

interface TooltipData {
  x: number;
  y: number;
  text: string;
}

export default function TextSelectionTooltip() {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedTerm, setSelectedTerm] = useState('');

  const handleSelection = useCallback(() => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();

    if (text && text.length > 1 && text.length < 50) {
      const range = selection?.getRangeAt(0);
      const rect = range?.getBoundingClientRect();
      if (rect) {
        setTooltip({
          x: rect.left + rect.width / 2,
          y: rect.top - 10,
          text,
        });
        return;
      }
    }
    setTooltip(null);
  }, []);

  useEffect(() => {
    document.addEventListener('mouseup', handleSelection);
    document.addEventListener('keyup', handleSelection);
    return () => {
      document.removeEventListener('mouseup', handleSelection);
      document.removeEventListener('keyup', handleSelection);
    };
  }, [handleSelection]);

  const handleAction = (_action: string) => {
    if (!tooltip) return;
    setSelectedTerm(tooltip.text);
    setPanelOpen(true);
    setTooltip(null);
    window.getSelection()?.removeAllRanges();
  };

  return (
    <>
      {/* Floating Toolbar */}
      <AnimatePresence>
        {tooltip && !panelOpen && (
          <motion.div
            initial={{ opacity: 0, y: 5, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.95 }}
            className="fixed z-50 bg-slate-800 rounded-lg shadow-xl border border-slate-700 flex items-center overflow-hidden"
            style={{
              left: Math.min(Math.max(tooltip.x - 80, 10), window.innerWidth - 170),
              top: Math.max(tooltip.y - 40, 10),
            }}
          >
            <button
              onClick={() => handleAction('explain')}
              className="flex items-center gap-1 px-3 py-2 text-xs text-slate-200 hover:bg-slate-700 transition-colors"
            >
              <Search className="w-3 h-3" />
              解释
            </button>
            <div className="w-px h-4 bg-slate-600" />
            <button
              onClick={() => handleAction('data')}
              className="flex items-center gap-1 px-3 py-2 text-xs text-slate-200 hover:bg-slate-700 transition-colors"
            >
              <BarChart3 className="w-3 h-3" />
              关联数据
            </button>
            <div className="w-px h-4 bg-slate-600" />
            <button
              onClick={() => handleAction('graph')}
              className="flex items-center gap-1 px-3 py-2 text-xs text-slate-200 hover:bg-slate-700 transition-colors"
            >
              <MapPin className="w-3 h-3" />
              图谱定位
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Explanation Panel */}
      <AnimatePresence>
        {panelOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={() => setPanelOpen(false)}
          >
            <motion.div
              initial={{ x: 100, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 100, opacity: 0 }}
              transition={{ type: 'tween', duration: 0.3, ease: 'easeOut' }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-xl p-5 w-[440px] max-h-[80vh] overflow-y-auto shadow-xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium text-slate-800 flex items-center gap-2">
                  <Search className="w-4 h-4 text-blue-500" />
                  术语解析：{selectedTerm}
                </h3>
                <button onClick={() => setPanelOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Quick Explanation */}
              <div className="bg-blue-50 rounded-lg p-3 mb-4">
                <div className="text-xs text-blue-600 font-medium mb-1">速览</div>
                <p className="text-sm text-blue-800">
                  {selectedTerm} 是高考志愿填报中的常见概念，涉及专业选择、院校层次等多个维度。
                </p>
              </div>

              {/* Subject Tree */}
              <div className="mb-4">
                <div className="text-xs text-slate-500 font-medium mb-2">学科树</div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="bg-slate-100 px-2 py-1 rounded">工学</span>
                  <span className="text-slate-400">→</span>
                  <span className="bg-slate-100 px-2 py-1 rounded">计算机类</span>
                  <span className="text-slate-400">→</span>
                  <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded font-medium">{selectedTerm}</span>
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  核心课程：数据结构、算法设计、操作系统、计算机网络
                </div>
              </div>

              {/* Employment Map */}
              <div className="mb-4">
                <div className="text-xs text-slate-500 font-medium mb-2">就业地图</div>
                <div className="space-y-1.5">
                  {[
                    { dest: '互联网大厂', salary: '15-30万/年', pct: '35%' },
                    { dest: '国企/事业单位', salary: '10-18万/年', pct: '25%' },
                    { dest: '金融行业', salary: '12-25万/年', pct: '15%' },
                    { dest: '继续深造', salary: '-', pct: '15%' },
                    { dest: '创业公司', salary: '10-20万/年', pct: '10%' },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-xs py-1.5 px-2 bg-slate-50 rounded">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-600">{item.dest}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-green-600 font-medium">{item.salary}</span>
                        <span className="text-slate-400 w-10 text-right">{item.pct}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* In Graph */}
              <div className="mb-4">
                <div className="text-xs text-slate-500 font-medium mb-2">在 Moirca 中的位置</div>
                <div className="flex items-center gap-2 text-xs">
                  <MapPin className="w-3 h-3 text-purple-500" />
                  <span className="text-slate-600">知识图谱中已关联 3 个相关节点</span>
                </div>
              </div>

              {/* Deep Report Button */}
              <button className="w-full py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-sm font-medium rounded-lg hover:from-blue-600 hover:to-cyan-600 transition-all flex items-center justify-center gap-2">
                <FileText className="w-4 h-4" />
                生成深度分析报告
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
