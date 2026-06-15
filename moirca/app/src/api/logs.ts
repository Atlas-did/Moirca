import { get } from './index';

export interface LogsResponse {
  path: string | null;
  lines: string[];
}

export async function getRecentLogs(lines = 120): Promise<LogsResponse> {
  return get<LogsResponse>(`/logs/recent?lines=${encodeURIComponent(lines)}`);
}