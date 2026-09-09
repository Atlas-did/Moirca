// evaluate(§a.5,pro only):Runtime.evaluate,MAIN world,返回值须 JSON 可序列化 ≤100KB。
// 安全校验:expression 长度 ≤100,000(MCP schema maxLength);拒绝空表达式;
// 不提供 function+args 之外的第二注入面(契约 params 仅 expression,不扩面)。
import { BridgeError } from '../../background/bridge-error.js';
import type { EvaluateParams, EvaluateResult } from '@webbridge/shared-types';
import type { CommandDeps } from '../deps.js';

const EXPRESSION_MAX_CHARS = 100_000;
const RESULT_MAX_CHARS = 100 * 1024; // 100KB(§a.5)

export function validateExpression(expression: unknown): string {
  if (typeof expression !== 'string' || expression.trim() === '') {
    throw new BridgeError('INVALID_PARAMS', 'evaluate: expression 必填且不能为空白', { field: 'expression' });
  }
  if (expression.length > EXPRESSION_MAX_CHARS) {
    throw new BridgeError('INVALID_PARAMS', `evaluate: expression 超过 ${EXPRESSION_MAX_CHARS} 字符上限`, {
      field: 'expression',
      length: expression.length,
    });
  }
  return expression;
}

export function checkResultSize(value: unknown): void {
  let serialized: string;
  try {
    serialized = JSON.stringify(value) ?? '';
  } catch {
    throw new BridgeError('INVALID_PARAMS', 'evaluate: 返回值不可 JSON 序列化(§a.5 要求 JSON 可序列化)', {
      field: 'value',
    });
  }
  if (serialized.length > RESULT_MAX_CHARS) {
    throw new BridgeError('INVALID_PARAMS', `evaluate: 返回值超过 100KB 上限(${serialized.length} 字符)`, {
      serializedLength: serialized.length,
    });
  }
}

export async function evaluate(deps: CommandDeps, params: EvaluateParams): Promise<EvaluateResult> {
  const cdp = deps.cdp!;
  const target = params.target ?? 'newTab';
  const tabId = await deps.resolver.resolve(target, { commandId: deps.commandId });
  const expression = validateExpression(params?.expression);

  const res = (await cdp.sendCommand(tabId, 'Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  })) as {
    result?: { value?: unknown };
    exceptionDetails?: { text: string; exception?: { description?: string } };
  };
  if (res.exceptionDetails) {
    const detail = res.exceptionDetails.exception?.description ?? res.exceptionDetails.text;
    throw new BridgeError('INVALID_PARAMS', `evaluate 执行异常:${detail.slice(0, 500)}`, { tabId });
  }
  const value = res.result?.value;
  checkResultSize(value);
  const state = (await cdp.sendCommand(tabId, 'Runtime.evaluate', {
    expression: 'JSON.stringify({ url: location.href })',
    returnByValue: true,
  })) as { result?: { value?: string } };
  let url = '';
  try {
    url = (JSON.parse(state.result?.value ?? '{}') as { url?: string }).url ?? '';
  } catch {
    url = '';
  }
  return { ok: true, tabId, url, value };
}
