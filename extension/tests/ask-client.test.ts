// /api/context/ask 请求校验单测(§e.2 字段约束,通道②)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateAskRequest, CONTEXT_TEXT_MAX_CHARS, QUESTION_MAX_CHARS, AGENT_IDS } from '../src/readonly/ask-client.js';

describe('contextAsk 请求校验(§e.2)', () => {
  const valid = { page_title: '', page_url: '', context_text: '正文', question: '610 分能上吗?', agent_id: 'master' };

  test('合法请求通过', () => {
    assert.doesNotThrow(() => validateAskRequest(valid));
  });

  test('question 必填', () => {
    assert.throws(() => validateAskRequest({ ...valid, question: '' }), /question 不能为空/);
  });

  test('question ≤2000', () => {
    assert.throws(() => validateAskRequest({ ...valid, question: 'a'.repeat(2001) }), /2000/);
    assert.equal(QUESTION_MAX_CHARS, 2000);
  });

  test('context_text 上限 = 12000(有效上限)', () => {
    assert.equal(CONTEXT_TEXT_MAX_CHARS, 12_000);
    assert.throws(() => validateAskRequest({ ...valid, context_text: 'a'.repeat(24_001) }), /超长/);
  });

  test('agent_id 枚举(文档级)', () => {
    assert.deepEqual([...AGENT_IDS], ['master', 'zhang', 'data', 'risk', 'parents', 'senior', 'workplace']);
  });
});
