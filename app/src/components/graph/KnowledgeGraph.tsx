import { useRef, useEffect, useCallback, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import type { GraphNode, GraphEdge } from '@/types';
import { getGraphData } from '@/api/graph';

// ============================================================
// 物理引擎常量
// ============================================================
const REPULSION_FORCE = 1400;
const SPRING_LENGTH = 90;
const SPRING_STRENGTH = 0.02;
const CENTER_ATTRACT = 0.008;
const DAMPING = 0.88;
const MAX_SPEED = 6;

// ============================================================
// 画布配色(DESIGN_SPEC_V2 §3 — Obsidian graph view 式;画布恒为深色,双主题不变,白名单内)
// ============================================================
const CANVAS_BG = '#101720';
const CANVAS_GRID = 'rgba(255,255,255,0.015)';
const CANVAS_GRID_STEP = 48;
const EDGE_COLOR = 'rgba(255,255,255,0.08)';
const EDGE_COLOR_HOVER = 'rgba(255,255,255,0.32)';
const EDGE_WIDTH = 1;
const EDGE_WIDTH_HOVER = 1.5;
const LABEL_COLOR = 'rgba(185,194,207,0.55)';
const LABEL_COLOR_ACTIVE = '#E8EAED';
const LABEL_SIZE = 10;
const NODE_STROKE = 'rgba(255,255,255,0.10)';
const CLUSTER_ALPHA = 0.07;
const SELECT_STROKE = '#E8EAED';

// 渲染半径脱离数据(v2 §3.2:n.radius/icon 字段保留在数据层,渲染层不读)
const NODE_R: Record<string, number> = { user: 8, school: 5, major: 4, career: 3.5, role: 4, system: 6 };
const nodeR = (type: string) => NODE_R[type] ?? 4;

// 节点分类色:专业 靛蓝 / 院校 松绿 / 就业 赭橙 / 角色 灰紫 / 用户 沙金
const NODE_PALETTE: Record<string, string> = {
  major: '#2E6DA4',
  school: '#2F8A6B',
  career: '#C05621',
  role: '#7A5FA0',
  user: '#D9A13B',
  system: '#46586E',
};
const nodeColor = (type: string, fallback: string) => NODE_PALETTE[type] ?? fallback;

export default function KnowledgeGraph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const animRef = useRef<number>(0);
  const dragRef = useRef<{ nodeId: string | null; offsetX: number; offsetY: number }>({
    nodeId: null, offsetX: 0, offsetY: 0,
  });
  const hoveredRef = useRef<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; node: GraphNode } | null>(null);
  const { state, dispatch } = useApp();

  const activeUpload = state.activeDocumentId
    ? state.uploadResults.find(item => item.documentId === state.activeDocumentId)
    : state.uploadResults[state.uploadResults.length - 1];

  // Load graph data from backend on mount
  useEffect(() => {
    getGraphData({
      graphId: activeUpload?.graphId,
      documentId: activeUpload?.documentId,
    })
      .then(data => dispatch({ type: 'LOAD_GRAPH_DATA', payload: data }))
      .catch(() => {}); // 静默降级，使用初始硬编码数据
  }, [dispatch, activeUpload?.documentId, activeUpload?.graphId]);

  // Sync with global state
  useEffect(() => {
    nodesRef.current = state.graphNodes.map(n => ({ ...n }));
    edgesRef.current = state.graphEdges.map(e => ({ ...e }));
  }, [state.graphNodes, state.graphEdges]);

  // Canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const resize = () => {
      const rect = parent.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(dpr, dpr);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  // Physics + Render loop
  const simulate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width / (window.devicePixelRatio || 1);
    const height = canvas.height / (window.devicePixelRatio || 1);
    const nodes = nodesRef.current;
    const edges = edgesRef.current;

    // Physics
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (dragRef.current.nodeId === n.id) continue;

      let fx = 0, fy = 0;

      // Repulsion
      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        const o = nodes[j];
        const dx = n.x - o.x;
        const dy = n.y - o.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        if (dist < 300) {
          const f = REPULSION_FORCE / (dist * dist);
          fx += (dx / dist) * f;
          fy += (dy / dist) * f;
        }
      }

      // Spring force from edges
      for (const e of edges) {
        if (e.source === n.id || e.target === n.id) {
          const otherId = e.source === n.id ? e.target : e.source;
          const other = nodes.find(nn => nn.id === otherId);
          if (!other) continue;
          const dx = other.x - n.x;
          const dy = other.y - n.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const f = (dist - SPRING_LENGTH) * SPRING_STRENGTH;
          fx += (dx / dist) * f;
          fy += (dy / dist) * f;
        }
      }

      // Center attraction
      fx += (width / 2 - n.x) * CENTER_ATTRACT;
      fy += (height / 2 - n.y) * CENTER_ATTRACT;

      // Apply
      n.vx = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, (n.vx + fx) * DAMPING));
      n.vy = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, (n.vy + fy) * DAMPING));
      n.x += n.vx;
      n.y += n.vy;

      // Bounds(渲染半径,不再读数据层 radius)
      const br = nodeR(n.type);
      n.x = Math.max(br + 10, Math.min(width - br - 10, n.x));
      n.y = Math.max(br + 10, Math.min(height - br - 10, n.y));
    }

    // Render
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = CANVAS_BG;
    ctx.fillRect(0, 0, width, height);

    // Grid background
    ctx.strokeStyle = CANVAS_GRID;
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += CANVAS_GRID_STEP) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
    for (let y = 0; y < height; y += CANVAS_GRID_STEP) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }

    // 邻接表(每帧一次,供悬停邻居的邻边与标签提亮;v2 §3.3)
    const adjacency = new Map<string, Set<string>>();
    for (const e of edges) {
      if (!adjacency.has(e.source)) adjacency.set(e.source, new Set());
      if (!adjacency.has(e.target)) adjacency.set(e.target, new Set());
      adjacency.get(e.source)!.add(e.target);
      adjacency.get(e.target)!.add(e.source);
    }
    const activeId: string | null = hoveredRef.current ?? state.selectedNodeId;

    // Edges:全部实线,悬停邻边提亮(关系类型不再靠线型区分)
    for (const e of edges) {
      const s = nodes.find(n => n.id === e.source);
      const t = nodes.find(n => n.id === e.target);
      if (!s || !t) continue;

      const adjacent = activeId !== null
        && (e.source === activeId || e.target === activeId);

      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      ctx.strokeStyle = adjacent ? EDGE_COLOR_HOVER : EDGE_COLOR;
      ctx.lineWidth = adjacent ? EDGE_WIDTH_HOVER : EDGE_WIDTH;
      ctx.stroke();
    }

    // 聚类淡彩(v2 §3.2.4 — 同色系极淡色晕,Obsidian 式)
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = CLUSTER_ALPHA;
    for (const n of nodes) {
      const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, 18);
      glow.addColorStop(0, nodeColor(n.type, n.color));
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(n.x, n.y, 18, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // Nodes(统一实心小圆 + 用户空心环;无 emoji、无光环;v2 §3.2)
    for (const n of nodes) {
      const isHovered = hoveredRef.current === n.id;
      const isSelected = state.selectedNodeId === n.id;
      const isNeighbor = (hoveredRef.current !== null && adjacency.get(hoveredRef.current)?.has(n.id))
        || (state.selectedNodeId !== null && adjacency.get(state.selectedNodeId)?.has(n.id));
      const r = nodeR(n.type) + (isHovered ? 1 : 0);
      const fill = nodeColor(n.type, n.color);

      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      if (n.type === 'user') {
        // 用户节点 = 空心圆环:画布底色填充 + 2px 描环
        ctx.fillStyle = CANVAS_BG;
        ctx.fill();
        ctx.strokeStyle = isSelected ? SELECT_STROKE : fill;
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        // 同色 0.78 实心 + 1px 细描边(消除深底上纯色圆的塑料感)
        ctx.globalAlpha = 0.78;
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = isSelected ? SELECT_STROKE : NODE_STROKE;
        ctx.lineWidth = isSelected ? 1.5 : 1;
        ctx.stroke();
      }

      // 常显标签(hover/选中/邻居提亮;超长截断)
      const labelText = n.label.length > 8 ? `${n.label.slice(0, 7)}…` : n.label;
      ctx.font = `${LABEL_SIZE}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isHovered || isSelected || isNeighbor ? LABEL_COLOR_ACTIVE : LABEL_COLOR;
      ctx.fillText(labelText, n.x, n.y + r + 12);
    }

    animRef.current = requestAnimationFrame(simulate);
  }, [state.selectedNodeId]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(simulate);
    return () => cancelAnimationFrame(animRef.current);
  }, [simulate]);

  // Mouse handlers
  const getMousePos = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const findNodeAt = (x: number, y: number) => {
    for (let i = nodesRef.current.length - 1; i >= 0; i--) {
      const n = nodesRef.current[i];
      const dx = x - n.x;
      const dy = y - n.y;
      if (Math.sqrt(dx * dx + dy * dy) < nodeR(n.type) + 4) return n;
    }
    return null;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const { x, y } = getMousePos(e);
    const node = findNodeAt(x, y);
    if (node) {
      dragRef.current = { nodeId: node.id, offsetX: x - node.x, offsetY: y - node.y };
      dispatch({ type: 'SET_SELECTED_NODE', payload: node.id });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const { x, y } = getMousePos(e);
    if (dragRef.current.nodeId) {
      const node = nodesRef.current.find(n => n.id === dragRef.current.nodeId);
      if (node) {
        node.x = x - dragRef.current.offsetX;
        node.y = y - dragRef.current.offsetY;
        node.vx = 0;
        node.vy = 0;
      }
    } else {
      const node = findNodeAt(x, y);
      hoveredRef.current = node?.id || null;
      if (node) {
        setTooltip({ x: e.clientX + 12, y: e.clientY - 12, node });
      } else {
        setTooltip(null);
      }
    }
  };

  const handleMouseUp = () => {
    dragRef.current.nodeId = null;
  };

  const handleClick = (e: React.MouseEvent) => {
    const { x, y } = getMousePos(e);
    const node = findNodeAt(x, y);
    if (node) {
      dispatch({ type: 'SET_SELECTED_NODE', payload: node.id });
      if (node.type === 'school') {
        dispatch({ type: 'SET_SELECTED_SCHOOL', payload: node.id });
        dispatch({ type: 'SET_RIGHT_PANEL', payload: 'research' });
      }
    }
  };

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { dragRef.current.nodeId = null; hoveredRef.current = null; setTooltip(null); }}
        onClick={handleClick}
      />

      {/* Floating info panel */}
      {state.selectedNodeId && (
        <div
          className="absolute top-3 left-3 backdrop-blur-sm rounded-lg p-3 border border-white/10 max-w-[200px]"
          style={{ backgroundColor: 'rgba(13,18,28,0.86)' }}
        >
          {(() => {
            const node = nodesRef.current.find(n => n.id === state.selectedNodeId);
            if (!node) return null;
            return (
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] leading-4 text-[#98A2B3] border border-white/10 rounded-sm px-1">
                    {node.type === 'school' ? '院校' : node.type === 'major' ? '专业' : node.type === 'career' ? '就业方向' : node.type === 'role' ? '角色' : node.type === 'user' ? '用户数据' : '系统'}
                  </span>
                  <span className="text-[12px] font-medium text-[#DCE2EA]">{node.label}</span>
                </div>
                <div className="text-[11px] text-[#98A2B3]">
                  类型: {node.type === 'school' ? '院校' : node.type === 'major' ? '专业' : node.type === 'career' ? '就业方向' : node.type === 'role' ? '角色' : node.type === 'user' ? '用户数据' : '系统'}
                </div>
                {node.type === 'school' && (
                  <button
                    onClick={() => {
                      dispatch({ type: 'SET_SELECTED_SCHOOL', payload: node.id });
                      dispatch({ type: 'SET_RIGHT_PANEL', payload: 'research' });
                    }}
                    className="mt-2 text-[11px] text-[#7FA8D9] hover:text-[#A9C6EA] underline underline-offset-2 transition-colors duration-150"
                  >
                    查看深度研究 →
                  </button>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Graph Context */}
      <div
        className="absolute top-3 right-3 backdrop-blur-sm rounded-lg p-3 border border-white/10 max-w-[280px]"
        style={{ backgroundColor: 'rgba(13,18,28,0.86)' }}
      >
        <div className="text-[12px] font-medium text-[#DCE2EA] mb-1">图谱上下文</div>
        <div className="text-[11px] text-[#98A2B3] space-y-1">
          <div>来源：{activeUpload?.fileName || '默认知识图谱'}</div>
          <div>文档ID：{activeUpload?.documentId || '—'}</div>
          <div>图谱ID：{activeUpload?.graphId || '—'}</div>
          <div>模式：{activeUpload?.graphMode || 'default'}</div>
          {state.recommendMeta && (
            <>
              <div className="pt-1 text-[#74808F]">报告上下文</div>
              <div>省份：{String(state.recommendMeta.profile.province ?? '—')}</div>
              <div>分数：{String(state.recommendMeta.profile.score ?? '—')}</div>
              <div>档位：{String(state.recommendMeta.profile.auto_tier ?? '—')}</div>
            </>
          )}
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed pointer-events-none z-50 px-2 py-1 rounded-md text-[12px] text-[#DCE2EA] border border-white/10 backdrop-blur-sm"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            backgroundColor: 'rgba(13,18,28,0.90)',
          }}
        >
          {tooltip.node.label}
        </div>
      )}

      {/* Legend */}
      <div
        className="absolute bottom-3 left-3 rounded-lg p-2.5 border border-white/10 flex flex-wrap gap-x-3 gap-y-1 max-w-[320px]"
        style={{ backgroundColor: 'rgba(20,28,41,0.90)' }}
      >
        {[
          ['#2E6DA4', '专业'],
          ['#2F8A6B', '院校'],
          ['#C05621', '就业'],
          ['#7A5FA0', '角色'],
          ['#D9A13B', '用户'],
        ].map(([color, label]) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
            <span className="text-[11px] leading-none text-[#98A2B3]">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
