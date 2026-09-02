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

export default function ChartPanel() {
  const { state } = useApp();
  const [chartType, setChartType] = useState<ChartType>('score');

  const schoolName = state.selectedSchoolId
    ? state.graphNodes.find(n => n.id === state.selectedSchoolId)?.label || '南昌大学'
    : '南昌大学';

  return (
    <div className="h-full flex flex-col p-3">
      <h3 className="text-sm font-medium text-white mb-3">{schoolName} - 数据分析</h3>

      {/* Chart type tabs */}
      <div className="flex gap-1 mb-3">
        {[
          { id: 'score' as ChartType, label: '分数线', icon: <TrendingUp className="w-3.5 h-3.5" /> },
          { id: 'rank' as ChartType, label: '位次', icon: <Users className="w-3.5 h-3.5" /> },
          { id: 'salary' as ChartType, label: '薪资', icon: <DollarSign className="w-3.5 h-3.5" /> },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setChartType(t.id)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
              chartType === t.id ? 'bg-blue-500/20 text-blue-400' : 'text-slate-400 hover:bg-slate-700'
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
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="range" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
              />
              <Area type="monotone" dataKey="count" stroke="#10b981" fill="#10b981" fillOpacity={0.3} />
            </AreaChart>
          ) : (
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="year" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
              />
              <Line
                type="monotone"
                dataKey={chartType === 'score' ? 'score' : 'rank'}
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ fill: '#3b82f6', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          { label: '2024分数线', value: '590', unit: '分', color: 'text-blue-400' },
          { label: '全省排名', value: '10800', unit: '名', color: 'text-green-400' },
          { label: '平均薪资', value: '14.5', unit: '万/年', color: 'text-orange-400' },
        ].map(s => (
          <div key={s.label} className="bg-slate-700/50 rounded-lg p-2 text-center">
            <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
            <div className="text-[10px] text-slate-400">{s.label} <span className="text-slate-500">{s.unit}</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}
