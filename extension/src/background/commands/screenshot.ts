import { CDPController } from '../cdp-controller.js';
import { ScreenshotParams, ScreenshotResult } from '../../types/index.js';

export class ScreenshotCommand {
  constructor(private cdp: CDPController) {}

  async execute(params: ScreenshotParams): Promise<ScreenshotResult> {
    // 方案 1: 通过 CDP Page.captureScreenshot (不需要 tabCapture 权限)
    const format = params.format || 'png';
    const screenshotParams: Record<string, unknown> = {
      format,
    };
    if (format === 'jpeg' && params.quality) {
      screenshotParams.quality = params.quality;
    }

    const result = await this.cdp.sendCommand('Page.captureScreenshot', screenshotParams);

    // 获取页面尺寸
    const layout = await this.cdp.sendCommand('Page.getLayoutMetrics');

    return {
      success: true,
      image: result.data,  // base64
      width: Math.round(layout.cssContentSize?.width || 1920),
      height: Math.round(layout.cssContentSize?.height || 1080),
    };
  }
}
