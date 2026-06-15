import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Search, ExternalLink, Building2, Globe, AlertTriangle,
  Clock, Smartphone, BadgeCheck, ChevronDown, MapPin
} from 'lucide-react';
import { fetchAllSites } from '@/api/sites';
import type { PortalSitesData, RegionGroup, ProvinceSite, NationalPlatform } from '@/types';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import ScriptGuide from '@/components/portal/ScriptGuide';

// ============================================================
// 子组件
// ============================================================

/** 国家平台横幅卡片 */
function NationalCard({ platform }: { platform: NationalPlatform }) {
  return (
    <a
      href={platform.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-3 p-4 rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white
                 hover:shadow-md hover:border-blue-300 transition-all duration-200 group"
    >
      <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
        <BadgeCheck className="w-5 h-5 text-blue-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-stone-800 group-hover:text-blue-700 transition-colors">
            {platform.name}
          </span>
          <ExternalLink className="w-3 h-3 text-stone-300 group-hover:text-blue-400 transition-colors" />
        </div>
        <p className="text-xs text-stone-500 mt-0.5 line-clamp-2">{platform.description}</p>
      </div>
    </a>
  );
}

/** 省份卡片 */
function ProvinceCard({ province }: { province: ProvinceSite }) {
  const portalLinks = [
    province.portals.application,
    province.portals.score_query,
    province.portals.admission_query,
  ].filter(Boolean) as { label: string; url: string; description: string }[];

  return (
    <div className="p-4 rounded-xl border border-stone-200 bg-white hover:shadow-md hover:border-amber-200 transition-all duration-200">
      {/* 省份名 + 考试院 */}
      <div className="flex items-center gap-2 mb-3">
        <MapPin className="w-4 h-4 text-amber-500 shrink-0" />
        <span className="font-bold text-stone-800">{province.name}</span>
        <span className="text-stone-300">·</span>
        <a
          href={province.authority.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline truncate flex items-center gap-1"
        >
          <Building2 className="w-3 h-3" />
          {province.authority.name}
        </a>
      </div>

      {/* 入口链接 */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {portalLinks.map((link) => (
          <a
            key={link.label}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium
                       bg-amber-50 text-amber-700 border border-amber-200
                       hover:bg-amber-100 hover:border-amber-300 transition-colors"
            title={link.description}
          >
            {link.label}
            <ExternalLink className="w-2.5 h-2.5 opacity-50" />
          </a>
        ))}
      </div>

      {/* 备注 */}
      {province.notes && (
        <p className="text-[11px] text-stone-400 leading-relaxed line-clamp-2">{province.notes}</p>
      )}

      {/* 油猴脚本入口 */}
      {province.script_available && (
        <div className="mt-2 pt-2 border-t border-amber-100">
          <ScriptGuide provinceName={province.name} />
        </div>
      )}
    </div>
  );
}

/** 可折叠区域分组 */
function RegionSection({ region, defaultOpen }: { region: RegionGroup; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 py-3 px-1 hover:bg-amber-50/50 rounded-lg transition-colors group"
      >
        <ChevronDown
          className={`w-4 h-4 text-stone-400 transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
        />
        <span className="font-semibold text-stone-700 group-hover:text-stone-900">
          {region.name}
        </span>
        <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0">
          {region.provinces.length} 省
        </Badge>
      </button>
      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 pb-2"
        >
          {region.provinces.map((p) => (
            <ProvinceCard key={p.code} province={p} />
          ))}
        </motion.div>
      )}
      <Separator className="mt-1" />
    </div>
  );
}

/** 加载骨架屏 */
function LoadingSkeleton() {
  return (
    <div className="space-y-4 p-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-6 w-32" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {Array.from({ length: 3 }).map((_, j) => (
              <Skeleton key={j} className="h-28 rounded-xl" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// 主页面
// ============================================================

export default function PortalSitesPage() {
  const [data, setData] = useState<PortalSitesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchAllSites()
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || '加载失败');
        setLoading(false);
      });
  }, []);

  // 搜索过滤
  const filteredRegions = data?.regions
    .map((region) => ({
      ...region,
      provinces: region.provinces.filter(
        (p) =>
          !search ||
          p.name.includes(search) ||
          p.authority.name.includes(search) ||
          p.notes.includes(search)
      ),
    }))
    .filter((region) => region.provinces.length > 0);

  return (
    <ScrollArea className="h-full">
      <div className="max-w-6xl mx-auto px-5 py-6">
        {/* 页头 */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-stone-800 flex items-center gap-2">
            <Globe className="w-5 h-5 text-indigo-500" />
            全国高考志愿填报官方入口
          </h1>
          <p className="text-sm text-stone-500 mt-1">
            覆盖 31 个省份的官方教育考试院网站及志愿填报系统入口，所有链接均来自各省 .gov.cn / .edu.cn 官方域名。
          </p>
        </div>

        {/* 搜索框 */}
        <div className="relative mb-5">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <Input
            placeholder="搜索省份或考试院名称…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-10 rounded-xl border-stone-200 focus:border-indigo-300 bg-white"
          />
        </div>

        {/* 国家平台 */}
        {data?.national_platforms && data.national_platforms.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-stone-600 mb-3 flex items-center gap-1.5">
              <BadgeCheck className="w-4 h-4 text-blue-500" />
              国家平台
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {data.national_platforms.map((np) => (
                <NationalCard key={np.id} platform={np} />
              ))}
            </div>
          </div>
        )}

        <Separator className="mb-5" />

        {/* 加载 / 错误 / 空状态 */}
        {loading && <LoadingSkeleton />}

        {error && (
          <div className="flex items-center gap-2 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            <AlertTriangle className="w-4 h-4" />
            {error}
          </div>
        )}

        {!loading && !error && (!filteredRegions || filteredRegions.length === 0) && (
          <div className="text-center py-12 text-stone-400">
            <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">未找到匹配「{search}」的省份</p>
          </div>
        )}

        {/* 区域列表 */}
        {!loading && filteredRegions && (
          <div className="space-y-1">
            {filteredRegions.map((region) => (
              <RegionSection key={region.id} region={region} defaultOpen={!search} />
            ))}
          </div>
        )}

        {/* 温馨提示 */}
        {data?.tips && data.tips.length > 0 && (
          <>
            <Separator className="mt-5 mb-4" />
            <div className="rounded-xl bg-amber-50/50 border border-amber-100 p-4">
              <h3 className="text-xs font-semibold text-amber-700 mb-2 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                温馨提示
              </h3>
              <ul className="space-y-1">
                {data.tips.map((tip, i) => (
                  <li key={i} className="text-xs text-amber-700/80 flex items-start gap-1.5">
                    <span className="shrink-0 mt-0.5">{tip.slice(0, 2)}</span>
                    <span>{tip.slice(2)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {/* 底部 */}
        <div className="mt-6 text-center text-[11px] text-stone-300">
          数据更新于 {data?.updated_at || '—'} · 社区维护 · 如发现链接失效请反馈
        </div>
      </div>
    </ScrollArea>
  );
}
