import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Puzzle, Download, Copy, Check, ChevronDown, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const STEPS = [
  {
    num: 1,
    title: '方式一：Chrome 扩展（推荐）',
    desc: '下载 Moirca Chrome 扩展，功能更强（跨标签页、档案管理、Shadow DOM 隔离）',
    action: {
      label: '查看安装指南 →',
      url: 'https://github.com/moirca/moirca/blob/main/extension/README.md',
    },
  },
  {
    num: 2,
    title: '方式二：油猴脚本',
    desc: '安装 Tampermonkey 后复制脚本内容粘贴保存',
    action: {
      label: '安装 Tampermonkey →',
      url: 'https://www.tampermonkey.net/',
    },
  },
  {
    num: 3,
    title: '打开填报系统',
    desc: '进入官方志愿填报系统，页面右侧会出现「Moirca 填报助手」浮动面板。支持7省：广东/浙江/山东/江苏/河南/四川/湖北。',
    action: null,
  },
];

const SCRIPT_CONTENT = `// Moirca 志愿填报助手 v0.1.0
// 请将完整脚本内容粘贴到 Tampermonkey 中
// 脚本文件: moirca/scripts/moirca-auto-fill.user.js
// 详细说明: moirca/scripts/README.md`;

export default function ScriptGuide({ provinceName }: { provinceName?: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      // 尝试从项目脚本路径加载
      const base = window.location.origin;
      const resp = await fetch(`${base}/scripts/moirca-auto-fill.user.js`);
      if (resp.ok) {
        const text = await resp.text();
        await navigator.clipboard.writeText(text);
      } else {
        await navigator.clipboard.writeText(SCRIPT_CONTENT);
      }
    } catch {
      await navigator.clipboard.writeText(SCRIPT_CONTENT);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="border border-indigo-200 bg-gradient-to-br from-indigo-50/50 to-white rounded-xl overflow-hidden">
      {/* 触发按钮 */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-4 hover:bg-indigo-50/30 transition-colors text-left"
      >
        <div className="w-9 h-9 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
          <Puzzle className="w-5 h-5 text-indigo-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-stone-800">
              🔧 {provinceName ? `${provinceName}支持` : '支持'}油猴脚本自动填充
            </span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-green-100 text-green-700 border-green-200">
              新功能
            </Badge>
          </div>
          <p className="text-xs text-stone-500 mt-0.5">
            一键将 Moirca 推荐结果填入官方系统 · 支持油猴脚本或 Chrome 扩展
          </p>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-stone-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* 展开内容 */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-indigo-100">
              {/* 步骤列表 */}
              <div className="mt-3 space-y-2">
                {STEPS.map((step) => (
                  <div key={step.num} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                      {step.num}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-stone-700">{step.title}</p>
                      <p className="text-xs text-stone-500 mt-0.5">{step.desc}</p>
                      {step.action && (
                        <a
                          href={step.action.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 mt-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                        >
                          {step.action.label}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* 操作按钮 */}
              <div className="mt-4 flex gap-2">
                <Button
                  size="sm"
                  variant={copied ? 'secondary' : 'default'}
                  onClick={handleCopy}
                  className="text-xs h-8 gap-1.5"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      已复制
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      复制脚本内容
                    </>
                  )}
                </Button>
                <a
                  href="https://github.com/moirca/moirca/blob/main/scripts/moirca-auto-fill.user.js"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button size="sm" variant="outline" className="text-xs h-8 gap-1.5">
                    <Download className="w-3.5 h-3.5" />
                    直接下载
                  </Button>
                </a>
              </div>

              <p className="text-[10px] text-stone-400 mt-2">
                ⚠️ 脚本仅在官方志愿填报系统页面运行 · 不读取密码 · 不自动提交 · 数据本地处理
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
