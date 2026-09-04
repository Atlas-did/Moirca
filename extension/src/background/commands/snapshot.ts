import { CDPController } from '../cdp-controller.js';
import { SnapshotParams, SnapshotResult } from '../../types/index.js';

export class SnapshotCommand {
  constructor(private cdp: CDPController) {}

  async execute(params: SnapshotParams): Promise<SnapshotResult> {
    // 获取 accessibility tree
    const { root } = await this.cdp.sendCommand('Accessibility.getFullAXTree');

    // 解析为可读文本
    const text = this.parseAXTree(root);

    // 获取页面信息
    const titleResult = await this.cdp.sendCommand('Runtime.evaluate', {
      expression: 'JSON.stringify({ title: document.title, url: location.href })',
      returnByValue: true,
    });
    const pageInfo = JSON.parse(titleResult.result?.value || '{}');

    // 如果需要 refs，构建 ref 映射
    let refs: Record<string, { backendDOMNodeId: number }> | undefined;
    if (params.refs) {
      refs = await this.buildRefs(root);
      // 存到 window 上供后续 click/fill 使用
      await this.cdp.sendCommand('Runtime.evaluate', {
        expression: `window.__webbridge_refs__ = ${JSON.stringify(
          Object.fromEntries(
            Object.entries(refs).map(([k, v]) => [k, v.backendDOMNodeId])
          )
        )}`,
      });
    }

    return {
      success: true,
      text,
      refs,
      title: pageInfo.title,
      url: pageInfo.url,
    };
  }

  private parseAXTree(node: any, depth = 0): string {
    if (!node) return '';
    const lines: string[] = [];

    if (node.name?.value) {
      const indent = '  '.repeat(depth);
      const role = node.role?.value || '';
      lines.push(`${indent}[${role}] ${node.name.value}`);
    }

    if (node.children) {
      for (const child of node.children) {
        lines.push(this.parseAXTree(child, depth + (node.name?.value ? 1 : 0)));
      }
    }

    return lines.join('\n');
  }

  private async buildRefs(node: any): Promise<Record<string, { backendDOMNodeId: number }>> {
    const refs: Record<string, { backendDOMNodeId: number }> = {};
    let counter = 0;

    const walk = (n: any) => {
      if (!n) return;
      if (n.backendDOMNodeId) {
        const ref = `@${counter++}`;
        refs[ref] = { backendDOMNodeId: n.backendDOMNodeId };
      }
      if (n.children) {
        for (const child of n.children) walk(child);
      }
    };

    walk(node);
    return refs;
  }
}
