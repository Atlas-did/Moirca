// 结构化异常(扩展侧):与 shared-types WsError 同构的可 throw 错误对象。
// - extends Error:assert.throws / instanceof / message 语义正常
// - toJSON:WS 序列化不丢 code/num/message(data)
import { ERROR_NUM, HTTP_ONLY_NUM, type ErrorCode } from '@webbridge/shared-types';

export class BridgeError extends Error {
  code: ErrorCode;
  num: number;
  data?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, data?: Record<string, unknown>) {
    super(message);
    this.name = 'BridgeError';
    this.code = code;
    const n = ERROR_NUM[code];
    this.num = n === null || n === undefined ? HTTP_ONLY_NUM : n;
    if (data) this.data = data;
  }

  /** WsError 形态(WSResultMessage.error 序列化用) */
  toJSON(): { code: ErrorCode; num: number; message: string; data?: Record<string, unknown> } {
    const out: { code: ErrorCode; num: number; message: string; data?: Record<string, unknown> } = {
      code: this.code,
      num: this.num,
      message: this.message,
    };
    if (this.data) out.data = this.data;
    return out;
  }
}

/** 抛出结构化错误的快捷方式(替代 throw makeError(...)) */
export function throwErr(code: ErrorCode, message: string, data?: Record<string, unknown>): never {
  throw new BridgeError(code, message, data);
}
