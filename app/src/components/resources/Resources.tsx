import { useState } from 'react';
import { motion } from 'framer-motion';
import { Database, CheckCircle, AlertTriangle, Lock, RefreshCw, Terminal } from 'lucide-react';

const DATA_SOURCES = [
  {
    id: 'kuangkuang',
    name: '框框大学',
    count: 10075,
    status: 'ready' as const,
    desc: '大学生真实评价数据，覆盖院校、专业、就业等多维度',
    color: 'green',
    lastUpdate: '2024-05-15',
  },
  {
    id: 'official',
    name: '官方招生数据',
    count: 3,
    status: 'update' as const,
    desc: '各省教育考试院发布的官方招生计划与录取数据',
    color: 'yellow',
    lastUpdate: '2024-05-01',
  },
  {
    id: 'network',
    name: '独家朋友网络',
    count: 42,
    status: 'private' as const,
    desc: '校友网络提供的内部就业信息、导师评价等私有数据',
    color: 'gray',
    lastUpdate: '2024-04-20',
  },
];

export default function ResourcesPanel() {
  const [isCrawling, setIsCrawling] = useState(false);
  const [logs, setLogs] = useState<string[]>([
    '[系统] Moirca 数据管理系统已启动',
    '[系统] 当前数据版本: v2.1.0',
    '[框框大学] 数据已就绪，共 10,075 条记录',
  ]);

  const handleCrawl = () => {
    setIsCrawling(true);
    const steps = [
      '[API] 连接框框大学数据接口...',
      '[爬虫] 分页下载第 1/50 页...',
      '[反爬] 检测到频率限制，切换代理...',
      '[Playwright] 启动浏览器渲染...',
      '[清洗] 去除重复数据，格式化字段...',
      '[SQLite] 数据入库完成，新增 127 条',
      '[系统] 数据更新完成',
    ];

    let i = 0;
    const interval = setInterval(() => {
      if (i >= steps.length) {
        clearInterval(interval);
        setIsCrawling(false);
        return;
      }
      setLogs(prev => [...prev, steps[i]]);
      i++;
    }, 800);
  };

  return (
    <div className="h-full flex flex-col p-6">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-800 mb-1">数据资源管理</h2>
        <p className="text-sm text-slate-500">管理 Moirca 系统的数据源，确保数据及时更新</p>
      </div>

      {/* Data Source Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {DATA_SOURCES.map((source, idx) => (
          <motion.div
            key={source.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between mb-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                source.status === 'ready' ? 'bg-green-50' :
                source.status === 'update' ? 'bg-yellow-50' : 'bg-gray-50'
              }`}>
                <Database className={`w-5 h-5 ${
                  source.status === 'ready' ? 'text-green-500' :
                  source.status === 'update' ? 'text-yellow-500' : 'text-gray-400'
                }`} />
              </div>
              {source.status === 'ready' && <CheckCircle className="w-4 h-4 text-green-400" />}
              {source.status === 'update' && <AlertTriangle className="w-4 h-4 text-yellow-400" />}
              {source.status === 'private' && <Lock className="w-4 h-4 text-gray-400" />}
            </div>

            <h3 className="font-medium text-slate-800 mb-1">{source.name}</h3>
            <p className="text-xs text-slate-500 mb-3">{source.desc}</p>

            <div className="flex items-baseline gap-1 mb-2">
              <span className="text-2xl font-bold text-slate-800">{source.count.toLocaleString()}</span>
              <span className="text-xs text-slate-400">条记录</span>
            </div>

            {/* Progress bar */}
            <div className="w-full h-1.5 bg-slate-100 rounded-full mb-3">
              <div className={`h-full rounded-full ${
                source.status === 'ready' ? 'bg-green-400' :
                source.status === 'update' ? 'bg-yellow-400' : 'bg-gray-300'
              }`} style={{ width: source.status === 'ready' ? '100%' : source.status === 'update' ? '70%' : '40%' }} />
            </div>

            <div className="flex gap-2">
              <button className="flex-1 text-xs bg-slate-50 hover:bg-slate-100 text-slate-600 py-1.5 rounded-md transition-colors">
                查看样本
              </button>
              <button className="flex-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 py-1.5 rounded-md transition-colors">
                更新数据
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Terminal Logs */}
      <div className="flex-1 bg-slate-900 rounded-xl overflow-hidden flex flex-col min-h-[200px]">
        <div className="h-9 bg-slate-800 border-b border-slate-700 flex items-center justify-between px-3">
          <div className="flex items-center gap-2">
            <Terminal className="w-3.5 h-3.5 text-green-400" />
            <span className="text-xs text-slate-300">数据采集日志</span>
          </div>
          <button
            onClick={handleCrawl}
            disabled={isCrawling}
            className="flex items-center gap-1 text-xs text-green-400 hover:text-green-300 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${isCrawling ? 'animate-spin' : ''}`} />
            {isCrawling ? '采集中...' : '一键爬取'}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 font-mono text-xs space-y-1">
          {logs.map((log, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className={`${
                log.includes('[系统]') ? 'text-blue-400' :
                log.includes('[API]') ? 'text-purple-400' :
                log.includes('[爬虫]') ? 'text-green-400' :
                log.includes('[反爬]') ? 'text-yellow-400' :
                log.includes('[Playwright]') ? 'text-cyan-400' :
                log.includes('[清洗]') ? 'text-orange-400' :
                log.includes('[SQLite]') ? 'text-pink-400' :
                'text-slate-300'
              }`}
            >
              {log}
            </motion.div>
          ))}
          {isCrawling && (
            <motion.div
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="text-green-400"
            >
              _
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
