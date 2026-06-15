import { get } from './index';

export interface HistoryItem {
  kind: 'upload' | 'report' | 'recommendation' | 'simulation';
  id: string;
  title: string;
  subtitle?: string;
  updated_at?: string | number;
  status?: string;
  progress?: number;
  preview?: string;
  meta?: Record<string, unknown>;
  result?: Record<string, unknown> | null;
}

export interface HistoryResponse {
  items: HistoryItem[];
  count: number;
}

export async function getHistoryItems(limit = 50): Promise<HistoryResponse> {
  return get<HistoryResponse>(`/history/items?limit=${encodeURIComponent(limit)}`);
}

export interface ReportRecord {
  report_id: number;
  user_id: string;
  profile_id: number;
  report_type: string;
  content_md: string;
  soul_questions?: string;
  risk_warnings?: string;
  created_at: string;
}

export interface ReportRecordsResponse {
  items: ReportRecord[];
  count: number;
}

export async function getReportRecords(limit = 30): Promise<ReportRecordsResponse> {
  return get<ReportRecordsResponse>(`/history/reports?limit=${encodeURIComponent(limit)}`);
}