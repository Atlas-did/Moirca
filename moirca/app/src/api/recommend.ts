/**
 * 推荐 API 类型与调用
 *
 * 对齐后端 api.md 定义的 RecommendResponse 格式
 */
import { post, get } from './index';

// ---- 后端响应类型 ----

export interface EvidenceItem {
  type: string;       // "public_data" | "wisdom" | "community" | "agent"
  label: string;
  value: string;
  source: string;
}

export interface RecommendItem {
  rank: number;
  tier: string;       // 冲/稳/保
  school: string;
  major: string;
  major_code: string;
  match_score: number;
  reason: string;
  risk_note?: string;
  evidence: EvidenceItem[];
  confidence: number;
}

export interface RecommendResponse {
  profile: {
    score: number;
    full_mark: number;
    province: string;
    percentage: number;
    auto_tier: string;
    user_tier: string;
    priority: string;
    exclusion: string;
  };
  recommendations: RecommendItem[];
  tier_summary: {
    冲: { count: number; schools: string[] };
    稳: { count: number; schools: string[] };
    保: { count: number; schools: string[] };
  };
  warnings: string[];
  meta: {
    rule_version: string;
    data_version: string;
    model: string;
    candidate_count: number;
    excluded_count: number;
  };
}

export interface RecommendRequest {
  score: number;
  province?: string;
  exam_type?: string;
  step1?: string;
  step2?: string;
  step3?: string;
  keywords?: string[];
  family_bg?: string;
  economic_tier?: string;
  top_n?: number;
}

// ---- API 调用 ----

export async function getRecommendations(params: RecommendRequest): Promise<RecommendResponse> {
  return post<RecommendResponse>('/recommend/', params);
}

export async function refreshRecommendationData(): Promise<{ refreshed: boolean }> {
  return post<{ refreshed: boolean }>('/recommend/refresh', {});
}

export interface AsyncRecommendResponse {
  job_id: string;
  status: 'running';
}

export interface AsyncJobStatus {
  job_id: string;
  status: 'running' | 'completed' | 'failed' | 'not_found';
  progress: number;
  message: string;
  result?: RecommendResponse | null;
}

export async function startAsyncRecommendation(params: RecommendRequest): Promise<AsyncRecommendResponse> {
  return post<AsyncRecommendResponse>('/recommend/async', params);
}

export async function getAsyncRecommendationStatus(jobId: string): Promise<AsyncJobStatus> {
  return get<AsyncJobStatus>(`/recommend/status/${jobId}`);
}

export async function getRecommendationHistory(limit = 20): Promise<{ items: AsyncJobStatus[]; count: number }> {
  return get<{ items: AsyncJobStatus[]; count: number }>(`/recommend/history?limit=${encodeURIComponent(limit)}`);
}

export interface CompareRequest {
  left: { school: string; major: string };
  right: { school: string; major: string };
  score?: number;
  province?: string;
  keywords?: string[];
}

export interface DimensionResult {
  name: string;
  left: string;
  right: string;
  winner: string;
}

export interface CompareResponse {
  summary: string;
  dimensions: DimensionResult[];
  risks: string[];
  evidence: string[];
  recommendation: string;
}

export async function compareVolunteers(params: CompareRequest): Promise<CompareResponse> {
  return post<CompareResponse>('/compare/', params);
}

export interface GraphStats {
  total_nodes: number;
  total_edges: number;
  profession_count: number;
  school_count: number;
  career_count: number;
}

export async function getGraphStats(): Promise<GraphStats> {
  return get<GraphStats>('/recommend/graph/stats');
}
