import { useRef, useEffect, useCallback, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import type { GraphNode, GraphEdge } from '@/types';
import { getGraphData } from '@/api/graph';

// ============================================================
// 物理引擎常量
// ============================================================
const REPULSION_FORCE = 800;
const SPRING_LENGTH = 120;
const SPRING_STRENGTH = 0.03;
const CENTER_ATTRACT = 0.008;
const DAMPING = 0.88;
const MAX_SPEED = 6;

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

      // Bounds
      n.x = Math.max(n.radius + 10, Math.min(width - n.radius - 10, n.x));
      n.y = Math.max(n.radius + 10, Math.min(height - n.radius - 10, n.y));
    }

    // Render
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    // Grid background
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
    for (let y = 0; y < height; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }

    // Edges
    for (const e of edges) {
      const s = nodes.find(n => n.id === e.source);
      const t = nodes.find(n => n.id === e.target);
      if (!s || !t) continue;

      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);

      if (e.type === 'offer') {
        ctx.strokeStyle = 'rgba(59,130,246,0.4)';
        ctx.setLineDash([]);
      } else if (e.type === 'career') {
        ctx.strokeStyle = 'rgba(249,115,22,0.4)';
        ctx.setLineDash([6, 4]);
      } else {
        ctx.strokeStyle = 'rgba(148,163,184,0.25)';
        ctx.setLineDash([2, 3]);
      }
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Nodes
    for (const n of nodes) {
      const isHovered = hoveredRef.current === n.id;
      const isSelected = state.selectedNodeId === n.id;
      const r = n.radius * (isHovered ? 1.15 : 1);

      // Glow
      if (isHovered || isSelected) {
        const grd = ctx.createRadialGradient(n.x, n.y, r * 0.5, n.x, n.y, r * 2);
        grd.addColorStop(0, n.color + '40');
        grd.addColorStop(1, 'transparent');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r * 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Shape
      ctx.fillStyle = n.color;
      ctx.beginPath();
      if (n.type === 'system') {
        // Hexagon
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i - Math.PI / 6;
          const hx = n.x + r * Math.cos(angle);
          const hy = n.y + r * Math.sin(angle);
          i === 0 ? ctx.moveTo(hx, hy) : ctx.lineTo(hx, hy);
        }
        ctx.closePath();
      } else if (n.type === 'user') {
        // Star
        for (let i = 0; i < 10; i++) {
          const angle = (Math.PI / 5) * i - Math.PI / 2;
          const sr = i % 2 === 0 ? r : r * 0.5;
          const sx = n.x + sr * Math.cos(angle);
          const sy = n.y + sr * Math.sin(angle);
          i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
        }
        ctx.closePath();
      } else {
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      }
      ctx.fill();

      // Border for selected
      if (isSelected) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      // Icon
      ctx.font = `${Math.max(14, r * 0.7)}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(n.icon, n.x, n.y - 1);

      // Label
      ctx.font = `11px sans-serif`;
      ctx.fillStyle = isHovered ? '#fff' : '#cbd5e1';
      ctx.fillText(n.label, n.x, n.y + r + 14);
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
      if (Math.sqrt(dx * dx + dy * dy) < n.radius + 5) return n;
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
        <div className="absolute top-3 left-3 backdrop-blur-md rounded-xl p-3 border border-white/10 text-white max-w-[200px]"
          style={{ backgroundColor: 'rgba(15,23,42,0.8)' }}>
          {(() => {
            const node = nodesRef.current.find(n => n.id === state.selectedNodeId);
            if (!node) return null;
            return (
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{node.icon}</span>
                  <span className="font-medium text-sm">{node.label}</span>
                </div>
                <div className="text-xs text-slate-400">
                  类型: {node.type === 'school' ? '院校' : node.type === 'major' ? '专业' : node.type === 'career' ? '就业方向' : node.type === 'role' ? '角色' : node.type === 'user' ? '用户数据' : '系统'}
                </div>
                {node.type === 'school' && (
                  <button
                    onClick={() => {
                      dispatch({ type: 'SET_SELECTED_SCHOOL', payload: node.id });
                      dispatch({ type: 'SET_RIGHT_PANEL', payload: 'research' });
                    }}
                    className="mt-2 text-xs text-blue-400 hover:text-blue-300 underline"
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
      <div className="absolute top-3 right-3 backdrop-blur-md rounded-xl p-3 border border-white/10 text-white max-w-[280px]"
        style={{ backgroundColor: 'rgba(15,23,42,0.8)' }}>
        <div className="text-xs font-medium text-slate-200 mb-1">图谱上下文</div>
        <div className="text-[11px] text-slate-300 space-y-1">
          <div>来源：{activeUpload?.fileName || '默认知识图谱'}</div>
          <div>文档ID：{activeUpload?.documentId || '—'}</div>
          <div>图谱ID：{activeUpload?.graphId || '—'}</div>
          <div>模式：{activeUpload?.graphMode || 'default'}</div>
          {state.recommendMeta && (
            <>
              <div className="pt-1 text-slate-400">报告上下文</div>
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
          className="fixed pointer-events-none z-50 px-2 py-1 rounded-md text-xs text-white backdrop-blur-sm"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            backgroundColor: 'rgba(15,23,42,0.85)',
          }}
        >
          {tooltip.node.label}
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-3 left-3 backdrop-blur-md rounded-lg p-2 border border-white/10 text-white text-[10px]"
        style={{ backgroundColor: 'rgba(15,23,42,0.8)' }}>
        <div className="flex items-center gap-1.5 mb-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" />专业</div>
        <div className="flex items-center gap-1.5 mb-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500" />院校</div>
        <div className="flex items-center gap-1.5 mb-1"><span className="w-2.5 h-2.5 rounded-full bg-orange-500" />就业</div>
        <div className="flex items-center gap-1.5 mb-1"><span className="w-2.5 h-2.5 rounded-full bg-purple-500" />角色</div>
        <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-500" />用户</div>
      </div>
    </div>
  );
}
