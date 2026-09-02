/**
 * 知识图谱 API — 适配前端 KnowledgeGraph 组件
 */
import { get } from './index';
import type { GraphNode, GraphEdge } from '@/types';

export interface GraphDataResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: {
    total_nodes: number;
    total_edges: number;
    profession_count: number;
    school_count: number;
    career_count: number;
  };
  context?: {
    source?: string;
    source_id?: string;
    graph_id?: string;
  };
}

export interface GraphDataParams {
  graphId?: string;
  documentId?: string;
}

export async function getGraphData(params?: GraphDataParams): Promise<GraphDataResponse> {
  const query = new URLSearchParams();
  if (params?.graphId) query.set('graph_id', params.graphId);
  if (params?.documentId) query.set('document_id', params.documentId);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return get<GraphDataResponse>(`/graph-viz/data${suffix}`);
}
