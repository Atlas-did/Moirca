import { useState } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, Terminal } from 'lucide-react';

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
    <div className="h-full flex flex-col p-5 overflow-y-auto thin-scrollbar">
      {/* 页首(v2 §5.2 统一骨架:T0 标题 + T0d 说明 + hairline) */}
      <div className="mb-4 border-b border-border pb-3">
        <h2 className="text-lg font-semibold tracking-tight text-foreground mb-1">数据资源管理</h2>
        <p className="text-xs text-muted-foreground">管理 Moirca 系统的数据源，确保数据及时更新</p>
      </div>

      {/* 数据源名单(v2 §5.10:全屏唯一一张卡,hairline 行列表,状态用一枚色点) */}
      <div className="panel-card mb-5 px-4">
        {DATA_SOURCES.map((source, idx) => (
          <div
            key={source.id}
            className={`flex items-center gap-3 py-3 ${idx < DATA_SOURCES.length - 1 ? 'border-b border-border' : ''}`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                source.status === 'ready'
                  ? 'bg-[hsl(var(--success))]'
                  : source.status === 'update'
                    ? 'bg-[hsl(var(--warning))]'
                    : 'bg-muted-foreground'
              }`}
            />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-foreground">{source.name}</div>
              <div className="text-xs text-muted-foreground mt-0.5 truncate">{source.desc}</div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-sm font-semibold tabular-nums text-foreground">
                {source.count.toLocaleString()}
                <span className="ml-1 text-[11px] font-normal text-muted-foreground">条记录</span>
              </div>
              <div className="text-[11px] tabular-nums text-muted-foreground">更新于 {source.lastUpdate}</div>
            </div>
            <div className="flex shrink-0 gap-1">
              <button className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                查看样本
              </button>
              <button className="h-7 px-2 text-xs text-primary hover:text-primary/80 transition-colors">
                更新数据
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Terminal Logs(规范 §5.7:终端恒为深色,与画布同域) */}
      <div className="panel-card flex-1 overflow-hidden flex flex-col min-h-[200px]">
        <div className="h-9 shrink-0 bg-[#101720] border-b border-white/10 flex items-center justify-between px-3">
          <div className="flex items-center gap-2">
            <Terminal className="w-3.5 h-3.5 text-[#2F8A6B]" />
            <span className="text-xs text-[#B9C2CF]">数据采集日志</span>
          </div>
          <button
            onClick={handleCrawl}
            disabled={isCrawling}
            className="flex items-center gap-1 text-xs text-[#2F8A6B] hover:text-[#3FA07F] disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${isCrawling ? 'animate-spin' : ''}`} />
            {isCrawling ? '采集中...' : '一键爬取'}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto thin-scrollbar bg-[#141C29] p-3 font-mono text-[11px] leading-relaxed space-y-1">
          {logs.map((log, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              className={`${
                log.includes('[系统]') || log.includes('[SQLite]') ? 'text-[#2F8A6B]' :
                log.includes('[反爬]') ? 'text-[#D9A13B]' :
                'text-[#B9C2CF]'
              }`}
            >
              {log}
            </motion.div>
          ))}
          {isCrawling && (
            <motion.div
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="text-[#2F8A6B]"
            >
              _
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
