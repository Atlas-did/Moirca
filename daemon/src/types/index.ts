// ============================================================
// daemon/src/types —— CONTRACT.md 的本地镜像
// 真源是 shared-types/src/(AGENT_03 所有);本目录是 daemon 的
// 本地拷贝,tests/drift.test.ts 逐字节校验防漂移。
// 禁止在本目录手工增改字段:先改 CONTRACT,再同步 shared-types,再同步此处。
// ============================================================
export * from './errors.js';
export * from './ws-protocol.js';
export * from './mcp-tools.js';
