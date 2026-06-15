/**
 * 数据贡献 API 客户端
 */
import { get, post } from './index';
import type { ContributePayload, ContributeResponse, ContributeStats, ContributeHistoryItem } from '@/types';

export function submitContribution(data: ContributePayload): Promise<ContributeResponse> {
  return post<ContributeResponse>('/contribute/', data);
}

export function fetchContributeStats(): Promise<ContributeStats> {
  return get<ContributeStats>('/contribute/stats');
}

export function fetchContributeHistory(anonymousId: string): Promise<{ items: ContributeHistoryItem[]; total: number }> {
  return get<{ items: ContributeHistoryItem[]; total: number }>(`/contribute/history?anonymous_id=${encodeURIComponent(anonymousId)}`);
}
