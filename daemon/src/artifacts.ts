// ============================================================
// daemon/src/artifacts.ts —— 文件旁路(CONTRACT §f)
// 根:daemon/artifacts/(env WEBBRIDGE_ARTIFACTS_DIR 可覆盖)
// 文件名:{kind}-{yyyymmdd-HHMMSS}-{seq3}.{ext}
// fileRef = file:///abs/root/{task_id}/{file}
// evidence.raw_ref = artifacts/{task_id}/{file}(相对形式)
// 保留策略:默认不做自动删除(§f,用户自决);cleanupOlderThan 供
// scripts/clean-artifacts(AGENT_07)或显式调用,env
// WEBBRIDGE_ARTIFACT_TTL_HOURS 可配置(默认 168h = 7 天)。
// ============================================================
import { mkdir, writeFile, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export type ArtifactKind = 'snapshot' | 'extract' | 'screenshot' | 'page';

export interface ArtifactsStoreOptions {
  root?: string;
}

export interface WrittenArtifact {
  fileName: string;
  /** file:///abs/path(契约 fileRef 字段格式) */
  fileRef: string;
  /** 相对形式:evidence.raw_ref 用 */
  relRef: string;
  bytes: number;
}

export function defaultArtifactsRoot(): string {
  if (process.env.WEBBRIDGE_ARTIFACTS_DIR) return path.resolve(process.env.WEBBRIDGE_ARTIFACTS_DIR);
  // <repo>/daemon/artifacts —— 本文件位于 daemon/src/
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../artifacts');
}

function pad3(n: number): string {
  return String(n).padStart(3, '0');
}

function stamp(d: Date): string {
  const p = (x: number, w = 2) => String(x).padStart(w, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export class ArtifactsStore {
  readonly root: string;
  private seq = new Map<string, number>();

  constructor(opts: ArtifactsStoreOptions = {}) {
    this.root = opts.root ?? defaultArtifactsRoot();
  }

  taskDir(taskId: string): string {
    // task_id 仅允许安全字符,防路径穿越
    if (!/^[A-Za-z0-9_-]+$/.test(taskId)) throw new Error(`非法 task_id: ${taskId}`);
    return path.join(this.root, taskId);
  }

  async write(taskId: string, kind: ArtifactKind, ext: string, content: string | Buffer): Promise<WrittenArtifact> {
    const dir = this.taskDir(taskId);
    await mkdir(dir, { recursive: true });
    const key = `${taskId}/${kind}`;
    const n = (this.seq.get(key) ?? 0) + 1;
    this.seq.set(key, n);
    const fileName = `${kind}-${stamp(new Date())}-${pad3(n)}.${ext.replace(/^\./, '')}`;
    const abs = path.join(dir, fileName);
    const buf = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
    await writeFile(abs, buf);
    return {
      fileName,
      fileRef: `file://${abs}`,
      relRef: `artifacts/${taskId}/${fileName}`,
      bytes: buf.byteLength,
    };
  }

  /**
   * 截图分析报告落盘(§a.6):root/_analysis/report-{reportId}.json。
   * reportId 来自扩展的 analysis_report.id(ulid 风格);不与 task 目录混用,
   * 集中放在 _analysis/ 下,目录不存在则创建。relRef 仍保持
   * artifacts/_analysis/{file} 三段相对形式,可作 evidence.raw_ref。
   */
  async writeAnalysisReport(reportId: string, content: string): Promise<WrittenArtifact> {
    if (!/^[A-Za-z0-9_-]+$/.test(reportId)) throw new Error(`非法 reportId: ${reportId}`);
    const dir = path.join(this.root, '_analysis');
    await mkdir(dir, { recursive: true });
    const fileName = `report-${reportId}.json`;
    const abs = path.join(dir, fileName);
    const buf = Buffer.from(content, 'utf8');
    await writeFile(abs, buf);
    return {
      fileName,
      fileRef: `file://${abs}`,
      relRef: `artifacts/_analysis/${fileName}`,
      bytes: buf.byteLength,
    };
  }

  /** 读取旁路文件(回查用);不存在返回 null */
  async read(relRef: string): Promise<Buffer | null> {
    const m = /^artifacts\/([A-Za-z0-9_-]+)\/([A-Za-z0-9._-]+)$/.exec(relRef);
    if (!m) return null;
    try {
      return await this.readFile(path.join(this.root, m[1]!, m[2]!));
    } catch {
      return null;
    }
  }

  private readFile(abs: string): Promise<Buffer> {
    // 延迟导入避免顶层 await;stat 校验存在性
    return stat(abs).then(() => import('node:fs/promises').then((fs) => fs.readFile(abs)));
  }

  /**
   * 清理早于 ttlHours 的旁路文件。默认策略:不自动删除(§f),
   * 仅由显式调用(脚本/手动)触发。返回删除的文件数。
   */
  async cleanupOlderThan(ttlHours: number = Number(process.env.WEBBRIDGE_ARTIFACT_TTL_HOURS ?? 168)): Promise<number> {
    const cutoff = Date.now() - ttlHours * 3600_000;
    let removed = 0;
    let tasks: string[] = [];
    try {
      tasks = await readdir(this.root);
    } catch {
      return 0;
    }
    for (const task of tasks) {
      const dir = path.join(this.root, task);
      let files: string[];
      try {
        files = await readdir(dir);
      } catch {
        continue;
      }
      for (const f of files) {
        const abs = path.join(dir, f);
        try {
          const s = await stat(abs);
          if (s.mtimeMs < cutoff) {
            await rm(abs);
            removed++;
          }
        } catch {
          /* 忽略单个文件失败 */
        }
      }
    }
    return removed;
  }
}
