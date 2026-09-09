import { useApp } from '@/contexts/AppContext';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { useState } from 'react';
import { TrendingUp, Users, DollarSign } from 'lucide-react';

const trendData = [
  { year: '2022', score: 580, rank: 12500 },
  { year: '2023', score: 585, rank: 11800 },
  { year: '2024', score: 590, rank: 10800 },
];

const salaryData = [
  { range: '6-8万', count: 15 },
  { range: '8-12万', count: 35 },
  { range: '12-18万', count: 28 },
  { range: '18-25万', count: 15 },
  { range: '25万+', count: 7 },
];

type ChartType = 'score' | 'rank' | 'salary';

const TOOLTIP_STYLE = {
  backgroundColor: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '6px',
  fontSize: '12px',
  color: 'hsl(var(--popover-foreground))',
  boxShadow: '0 2px 8px hsl(var(--foreground) / 0.08)',
} as const;

export default function ChartPanel() {
  const { state } = useApp();
  const [chartType, setChartType] = useState<ChartType>('score');

  const schoolName = state.selectedSchoolId
    ? state.graphNodes.find(n => n.id === state.selectedSchoolId)?.label || '南昌大学'
    : '南昌大学';

  return (
    <div className="h-full flex flex-col p-4">
      <h3 className="panel-title mb-3">{schoolName} - 数据分析</h3>

      {/* Chart type tabs */}
      <div className="flex items-center gap-1 border-b border-border mb-3">
        {[
          { id: 'score' as ChartType, label: '分数线', icon: <TrendingUp className="w-3.5 h-3.5" /> },
          { id: 'rank' as ChartType, label: '位次', icon: <Users className="w-3.5 h-3.5" /> },
          { id: 'salary' as ChartType, label: '薪资', icon: <DollarSign className="w-3.5 h-3.5" /> },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setChartType(t.id)}
            className={`flex items-center gap-1 px-2.5 h-8 border-b-2 -mb-px rounded-t-md text-xs font-medium transition-colors ${
              chartType === t.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'salary' ? (
            <AreaChart data={salaryData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="range" tickLine={false} axisLine={{ stroke: 'hsl(var(--border))' }} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: 'hsl(var(--muted-foreground))' }} cursor={{ stroke: 'hsl(var(--border))' }} />
              <Area type="monotone" dataKey="count" stroke="hsl(var(--chart-1))" fill="hsl(var(--chart-1))" fillOpacity={0.12} strokeWidth={2} />
            </AreaChart>
          ) : (
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="year" tickLine={false} axisLine={{ stroke: 'hsl(var(--border))' }} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: 'hsl(var(--muted-foreground))' }} />
              <Line
                type="monotone"
                dataKey={chartType === 'score' ? 'score' : 'rank'}
                stroke="hsl(var(--chart-1))"
                strokeWidth={2}
                dot={{ fill: 'hsl(var(--chart-1))', r: 3, strokeWidth: 0 }}
                activeDot={{ r: 5, strokeWidth: 2, stroke: 'hsl(var(--card))' }}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        {[
          { label: '2024分数线', value: '590', unit: '分', bar: 'hsl(var(--chart-1))' },
          { label: '全省排名', value: '10800', unit: '名', bar: 'hsl(var(--chart-2))' },
          { label: '平均薪资', value: '14.5', unit: '万/年', bar: 'hsl(var(--chart-3))' },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border border-l-[3px] rounded-lg shadow-xs p-3 text-left"
            style={{ borderLeftColor: s.bar }}>
            <div className="text-xl font-semibold tabular-nums text-foreground">{s.value}</div>
            <div className="text-xs text-muted-foreground">{s.label} <span className="text-muted-foreground/70">{s.unit}</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}
