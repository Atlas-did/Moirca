// 后端 HTTP 客户端(readonly 通道②):POST /api/context/ask(§e.2,字段逐字照抄契约)。
// 仅 readonly 模式使用;不落库、不启动浏览器动作、不切换标签(ARCHITECTURE 通道②)。
import { BridgeError } from '../background/bridge-error.js';

export const DEFAULT_BACKEND_BASE = 'http://localhost:8000';

export interface ContextAskRequest {
  page_title: string;
  page_url: string;
  context_text: string; // ≤12000(有效 12000,超出截断 truncated=true,§e.2)
  question: string; // 必填,≤2000
  agent_id: string; // master|zhang|data|risk|parents|senior|workplace
}

export interface ContextAskResponse {
  answer: string;
  model_used: 'llm' | 'fallback';
  agent_id: string;
  agent_name: string;
  truncated: boolean;
}

export const CONTEXT_TEXT_MAX_CHARS = 12_000;
export const QUESTION_MAX_CHARS = 2_000;
export const AGENT_IDS = ['master', 'zhang', 'data', 'risk', 'parents', 'senior', 'workplace'] as const;

export async function getBackendBase(): Promise<string> {
  const stored = (await chrome.storage.sync.get({ apiBase: '' })) as { apiBase?: string };
  const base = (stored.apiBase || DEFAULT_BACKEND_BASE).replace(/\/+$/, '');
  return base;
}

export function validateAskRequest(req: ContextAskRequest): void {
  if (!req.question || !req.question.trim()) {
    throw new BridgeError('INVALID_PARAMS', 'question 不能为空(§e.2)', { field: 'question' });
  }
  if (req.question.length > QUESTION_MAX_CHARS) {
    throw new BridgeError('INVALID_PARAMS', `question 超过 ${QUESTION_MAX_CHARS} 字符上限`, { field: 'question' });
  }
  if (req.context_text.length > CONTEXT_TEXT_MAX_CHARS * 2) {
    throw new BridgeError('INVALID_PARAMS', `context_text 超长(>${CONTEXT_TEXT_MAX_CHARS * 2})`, { field: 'context_text' });
  }
}

export async function contextAsk(req: ContextAskRequest): Promise<ContextAskResponse> {
  validateAskRequest(req);
  const base = await getBackendBase();
  let res: Response;
  try {
    res = await fetch(`${base}/api/context/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page_title: req.page_title ?? '',
        page_url: req.page_url ?? '',
        context_text: req.context_text ?? '',
        question: req.question,
        agent_id: req.agent_id || 'master',
      }),
    });
  } catch (e) {
    throw new BridgeError('BACKEND_UNREACHABLE', `无法连接后端 ${base}:${e instanceof Error ? e.message : String(e)}`, { base });
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string }; detail?: string };
    const message = body?.error?.message ?? body?.detail ?? `HTTP ${res.status}`;
    throw new BridgeError('INVALID_PARAMS', `后端 /api/context/ask 返回 ${res.status}:${message}`, { status: res.status });
  }
  return (await res.json()) as ContextAskResponse;
}

export async function pingBackend(): Promise<{ ok: boolean; raw: unknown }> {
  const base = await getBackendBase();
  const res = await fetch(`${base}/api/context/ping`);
  if (!res.ok) throw new BridgeError('BACKEND_UNREACHABLE', `后端 ping 返回 HTTP ${res.status}`, { base, status: res.status });
  return { ok: true, raw: await res.json() };
}
