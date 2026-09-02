import { post } from './index';

export interface InterviewRequest {
  agent_name: string;
  question: string;
  context?: Record<string, unknown>;
}

export interface InterviewResponse {
  agent_name: string;
  mode: 'template' | 'llm';
  answer: string;
  follow_ups?: string[];
}

export async function askInterview(payload: InterviewRequest): Promise<InterviewResponse> {
  return post<InterviewResponse>('/interview/ask', payload);
}