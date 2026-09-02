import { get, post } from './index';

export interface ReportGenerateRequest {
  profile: Record<string, unknown>;
  recommendations: Record<string, unknown>;
  simulation_id?: string;
  document_ids?: string[];
  report_context?: Record<string, unknown>;
}

export interface ReportGenerateResponse {
  report_id: string;
  created_at: string;
  mode: 'template' | 'llm';
  path: string;
  content_md: string;
}

export interface ReportContentResponse {
  report_id: string;
  content_md: string;
}

export async function generateReport(payload: ReportGenerateRequest): Promise<ReportGenerateResponse> {
  return post<ReportGenerateResponse>('/report/generate', payload);
}

export async function getReport(reportId: string): Promise<ReportContentResponse> {
  return get<ReportContentResponse>(`/report/${reportId}`);
}