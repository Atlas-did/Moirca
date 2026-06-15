import { useEffect, useRef, useState, useCallback } from 'react';
import { useApp } from '@/contexts/AppContext';
import * as d3 from 'd3';
import SchoolInfoCard from './SchoolInfoCard';
import { Search, X } from 'lucide-react';
import { getGraphData } from '@/api/graph';

const TIER_COLORS: Record<string, string> = {
  '985': '#D97706', '211': '#2563EB', '双一流': '#7C3AED',
};

function strip(s: string) {
  return s.replace(/^(school|city|major|tier|career|profession)[:_]/, '');
}

export default function KnowledgeGraph() {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const { state, dispatch } = useApp();
  const customPhase = (state as any).customPhase || 'idle';
  const matchedIds = (state as any).matchedSchoolIds || [];
  const [selectedSchool, setSelectedSchool] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<string | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, any> | null>(null);
  const simNodesRef = useRef<any[]>([]);
  const svgNodeRef = useRef<SVGSVGElement | null>(null);

  const activeUpload = state.activeDocumentId
    ? state.uploadResults.find(item => item.documentId === state.activeDocumentId)
    : state.uploadResults[state.uploadResults.length - 1];

  const searchAndZoom = useCallback((query: string) => {
    if (!query.trim() || !zoomRef.current || !svgNodeRef.current) return;
    const svg = d3.select(svgNodeRef.current);
    const nodes = simNodesRef.current;
    const lower = query.trim().toLowerCase();
    const found = nodes.find((n: any) =>
      n.type === 'school' && n.label.toLowerCase().includes(lower)
    );
    if (!found) { setSearchResult(null); return; }
    setSearchResult(found.label);
    const w = containerRef.current?.clientWidth || 800;
    const h = containerRef.current?.clientHeight || 600;
    const transform = d3.zoomIdentity
      .translate(w / 2, h / 2)
      .scale(1.8)
      .translate(-(found.x || 0), -(found.y || 0));
    svg.transition().duration(600).call(zoomRef.current.transform, transform);
  }, []);

  useEffect(() => {
    const documentId = state.activeDocumentId || activeUpload?.documentId || undefined;
    const graphId = activeUpload?.graphId;

    getGraphData({ documentId, graphId })
      .then(data => dispatch({ type: 'LOAD_GRAPH_DATA', payload: { nodes: data.nodes, edges: data.edges } }))
      .catch(() => {});
  }, [dispatch, state.activeDocumentId, activeUpload?.documentId, activeUpload?.graphId]);

  useEffect(() => {
    if (!state.graphNodes?.length || !svgRef.current || !containerRef.current) return;
    try {
      const svgEl = svgRef.current;
      svgNodeRef.current = svgEl;
      const svg = d3.select(svgEl);
      svg.selectAll('*').remove();
      const w = containerRef.current.clientWidth, h = containerRef.current.clientHeight;
      if (!w || !h) return;

      const nodeMap = new Map();
      const nodes: any[] = state.graphNodes.map(n => {
        const obj = { id: n.id, label: strip(n.label), type: n.type as string,
          province: (n as any).province || '', tier: (n as any).tier || '' };
        nodeMap.set(n.id, obj); return obj;
      });
      simNodesRef.current = nodes;
      const edges: any[] = state.graphEdges.filter(e => nodeMap.has(e.source) && nodeMap.has(e.target));

      const sim = d3.forceSimulation(nodes)
        .force('link', d3.forceLink(edges).id((d: any) => d.id).distance(40).strength(0.1))
        .force('charge', d3.forceManyBody().strength(-60))
        .force('center', d3.forceCenter(w/2, h/2))
        .force('collide', d3.forceCollide(18))
        .alphaDecay(0.02).velocityDecay(0.4);

      const g = svg.append('g');
      const zoom = d3.zoom<any, any>().scaleExtent([0.2, 5]).on('zoom', (e) => g.attr('transform', e.transform));
      zoomRef.current = zoom;
      svg.call(zoom);

      const link = g.append('g').selectAll('line').data(edges).enter().append('line')
        .attr('stroke', '#A0A0A0').attr('stroke-width', 2).attr('opacity', 0.5);

      const schools = nodes.filter((n: any) => n.type === 'school');
      const provinces = nodes.filter((n: any) => n.type === 'province');

      // Province labels (behind)
      const pg = g.append('g');
      pg.selectAll('text').data(provinces).enter().append('text')
        .text((d: any) => d.label)
        .attr('x', (d: any) => d.x).attr('y', (d: any) => d.y)
        .attr('text-anchor', 'middle').attr('dy', '-0.8em')
        .attr('font-size', '10px').attr('font-weight', '700').attr('fill', '#bbb');

      // Schools - bigger circles
      const sg = g.append('g');
      const circles = sg.selectAll('circle').data(schools).enter().append('circle')
        .attr('r', (d: any) => TIER_COLORS[d.tier] ? 12 : 8)
        .attr('fill', (d: any) => TIER_COLORS[d.tier] || '#78716C')
        .attr('opacity', (d: any) => {
          if (customPhase === 'idle' || customPhase === 'asking') return 1;
          if (customPhase === 'thinking') return 0.6;
          if (!matchedIds.length) return 1;
          return matchedIds.includes(d.id) ? 1 : 0.08;
        })
        .attr('stroke', '#fff').attr('stroke-width', 2.5).style('cursor', 'pointer')
        .call(d3.drag<any, any>()
          .on('start', (e, d: any) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
          .on('drag', (e, d: any) => { d.fx = e.x; d.fy = e.y; })
          .on('end', (e, d: any) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }))
        .on('mouseenter', function() { d3.select(this).attr('stroke', '#333').attr('stroke-width', 4); })
        .on('mouseleave', function() { d3.select(this).attr('stroke', '#fff').attr('stroke-width', 2.5); })
        .on('click', function(e: any, d: any) {
          e.stopPropagation();
          circles.attr('stroke', '#fff').attr('stroke-width', 2.5);
          link.attr('stroke', '#A0A0A0').attr('stroke-width', 2);
          d3.select(this).attr('stroke', '#E91E63').attr('stroke-width', 4);
          link.filter((l: any) => (l.source?.id||l.source)===d.id || (l.target?.id||l.target)===d.id)
            .attr('stroke', '#E91E63').attr('stroke-width', 3);
          setSelectedSchool(d.label);
        });

      // Labels for all schools
      const labels = sg.selectAll('text').data(schools).enter().append('text')
        .text((d: any) => d.label.length > 8 ? d.label.slice(0,8) : d.label)
        .attr('font-size', (d: any) => TIER_COLORS[d.tier] ? '11px' : '9px')
        .attr('fill', (d: any) => TIER_COLORS[d.tier] ? '#222' : '#666')
        .attr('font-weight', (d: any) => TIER_COLORS[d.tier] ? '700' : '400')
        .attr('opacity', (d: any) => {
          if (customPhase === 'idle' || customPhase === 'asking') return 1;
          if (customPhase === 'thinking') return 0.5;
          if (!matchedIds.length) return 1;
          return matchedIds.includes(d.id) ? 1 : 0.05;
        })
        .attr('dx', (d: any) => TIER_COLORS[d.tier] ? 16 : 12)
        .attr('dy', 4).style('pointer-events', 'none').style('font-family', 'sans-serif');

      sim.on('tick', () => {
        link.attr('x1', (d: any) => d.source?.x||0).attr('y1', (d: any) => d.source?.y||0)
            .attr('x2', (d: any) => d.target?.x||0).attr('y2', (d: any) => d.target?.y||0);
        circles.attr('cx', (d: any) => d.x||0).attr('cy', (d: any) => d.y||0);
        sg.selectAll('text').attr('x', (d: any) => d.x||0).attr('y', (d: any) => d.y||0);
        pg.selectAll('text').attr('x', (d: any) => d.x||0).attr('y', (d: any) => d.y||0);
      });

      svg.on('click', () => {
        circles.attr('stroke', '#fff').attr('stroke-width', 2.5);
        link.attr('stroke', '#A0A0A0').attr('stroke-width', 2);
      });

    } catch (err) {
      console.error(err);
    }
  }, [state.graphNodes, state.graphEdges]);

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden"
      style={{ backgroundColor:'#FAFAFA', backgroundImage:'radial-gradient(#D0D0D0 1.5px,transparent 1.5px)', backgroundSize:'24px 24px' }}>
      <svg ref={svgRef} className="w-full h-full block" />

      {/* Search Bar */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20">
        <form onSubmit={e => { e.preventDefault(); searchAndZoom(searchQuery); }} className="flex items-center gap-1">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜索学校..."
              className="w-48 pl-8 pr-8 py-2 text-sm bg-white/95 backdrop-blur-sm border border-stone-200 rounded-xl shadow-lg focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
            />
            {searchQuery && (
              <button type="button" onClick={() => { setSearchQuery(''); setSearchResult(null); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-stone-100">
                <X className="w-3 h-3 text-stone-400" />
              </button>
            )}
          </div>
        </form>
        {searchResult && (
          <div className="mt-1 text-center">
            <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-medium">
              已定位: {searchResult}
            </span>
          </div>
        )}
        {searchQuery && !searchResult && (
          <div className="mt-1 text-center">
            <span className="text-[10px] text-red-400">未找到匹配学校</span>
          </div>
        )}
      </div>

      <SchoolInfoCard schoolName={selectedSchool} onClose={() => setSelectedSchool(null)} />

      {matchedIds.length > 0 && (
        <div className="absolute top-3 right-3 bg-white/95 backdrop-blur-sm rounded-xl border border-emerald-200 px-4 py-2.5 shadow-md z-10">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-emerald-600">当前方案</span>
            <span className="text-xs text-stone-400">{matchedIds.length} 所院校</span>
          </div>
          <div className="mt-1.5 space-y-0.5 max-h-[200px] overflow-auto">
            {matchedIds.slice(0, 8).map(id => {
              const s = (state.graphNodes || []).find((n: any) => n.id === id);
              return s ? (
                <div key={id} className="text-[11px] text-stone-600 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{backgroundColor: TIER_COLORS[(s as any).tier] || '#999'}} />
                  {(s as any).label}
                </div>
              ) : null;
            })}
          </div>
        </div>
      )}

      <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-sm rounded-lg border border-stone-200 px-3 py-2 shadow-sm">
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {[['985','#D97706'],['211','#2563EB'],['双一流','#7C3AED']].map(([l,c]) => (
            <div key={String(c)} className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{backgroundColor:c}} /><span className="text-stone-500">{l}</span></div>
          ))}
        </div>
      </div>
    </div>
  );
}
