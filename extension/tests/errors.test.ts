// 错误码表漂移单测(§g.1:code → num 映射必须与 CONTRACT 一致)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ERROR_NUM, makeError, type ErrorCode } from '@webbridge/shared-types';

describe('错误码表(§g.1)', () => {
  const expected: Array<[ErrorCode, number | null]> = [
    ['PARSE_ERROR', -32700],
    ['INVALID_REQUEST', -32600],
    ['UNKNOWN_COMMAND', -32601],
    ['INVALID_PARAMS', -32602],
    ['EXT_NOT_CONNECTED', -32000],
    ['CMD_TIMEOUT', -32001],
    ['NAV_TIMEOUT', -32002],
    ['PERMISSION_DENIED', -32003],
    ['READONLY_REJECTED', -32004],
    ['TARGET_DENIED', -32005],
    ['REF_STALE', -32006],
    ['TAB_CLOSED', -32007],
    ['EXTRACT_FAILED', -32008],
    ['ROUTE_NO_MATCH', null],
    ['EVIDENCE_DB_FAIL', null],
    ['BACKEND_UNREACHABLE', null],
  ];

  for (const [code, num] of expected) {
    test(`${code} → ${num}`, () => {
      assert.equal(ERROR_NUM[code], num);
    });
  }

  test('makeError:code/num 恒一致,HTTP-only 码 num=0', () => {
    const e = makeError('REF_STALE', 'ref 已失效');
    assert.deepEqual({ code: e.code, num: e.num }, { code: 'REF_STALE', num: -32006 });
    const h = makeError('BACKEND_UNREACHABLE', '后端不可达');
    assert.equal(h.num, 0);
    const d = makeError('INVALID_PARAMS', '参数错误', { field: 'x' });
    assert.deepEqual(d.data, { field: 'x' });
  });
});
