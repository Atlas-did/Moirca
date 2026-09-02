/**
 * Agent 对话 API — 支持流式 SSE 和普通 JSON
 */
import { post } from './index';

export interface ChatRequest {
  message: string;
  agent_id: string;
  history?: { role: string; content: string }[];
}

export interface ChatResponse {
  reply: string;
  agent_id: string;
  agent_name: string;
  model_used: string;
}

export interface StreamMeta {
  type: 'meta';
  agent_name: string;
  model_used: string;
}

export interface StreamChunk {
  type: 'chunk';
  content: string;
}

export type StreamEvent = StreamMeta | StreamChunk;

export async function sendMessage(req: ChatRequest): Promise<ChatResponse> {
  return post<ChatResponse>('/chat/', req);
}

export async function sendMessageStream(
  req: ChatRequest,
  onMeta: (meta: StreamMeta) => void,
  onChunk: (text: string) => void,
  onDone: () => void,
): Promise<void> {
  const res = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ') && line !== 'data: [DONE]') {
        try {
          const event: StreamEvent = JSON.parse(line.slice(6));
          if (event.type === 'meta') onMeta(event as StreamMeta);
          else if (event.type === 'chunk') onChunk((event as StreamChunk).content);
        } catch { /* skip malformed */ }
      }
    }
  }
  onDone();
}
