// press_key 键位映射(纯逻辑,可单测)。
// 语义:单键 + '+' 组合键('Control+A','Shift+Enter'),对齐 CDP Input.dispatchKeyEvent
// 的 key/code/windowsVirtualKeyCode/text/modifiers 五元组。老版 v1 痛点:回车/组合键丢事件。
// 修复:文本键补 text 参数,组合键正确合成 modifiers,且 keyDown/keyUp 成对派发。

export interface CDPKeyEvent {
  type: 'keyDown' | 'keyUp' | 'rawKeyDown' | 'char';
  key: string;
  code?: string;
  windowsVirtualKeyCode?: number;
  nativeVirtualKeyCode?: number;
  text?: string;
  unmodifiedText?: string;
  modifiers?: number;
  location?: number;
  autoRepeat?: boolean;
}

export interface KeyPlan {
  modifiers: number; // Alt=1, Ctrl=2, Meta=4, Shift=8(Playwright/CDP 口径)
  events: CDPKeyEvent[]; // 完整 keyDown(+char)/keyUp 序列
}

const MODIFIER_BITS: Record<string, number> = {
  alt: 1,
  control: 2,
  ctrl: 2,
  meta: 4,
  command: 4,
  cmd: 4,
  shift: 8,
};

// 键名 → { code, vk, text? }(text 仅在产生字符时给;VK 表取自 DOM Level 3 / Chromium)
const KEY_TABLE: Record<string, { code: string; vk: number; text?: string; shiftedText?: string }> = {
  enter: { code: 'Enter', vk: 13, text: '\r' },
  tab: { code: 'Tab', vk: 9, text: '\t' },
  escape: { code: 'Escape', vk: 27 },
  esc: { code: 'Escape', vk: 27 },
  backspace: { code: 'Backspace', vk: 8 },
  delete: { code: 'Delete', vk: 46 },
  space: { code: 'Space', vk: 32, text: ' ' },
  pageup: { code: 'PageUp', vk: 33 },
  pagedown: { code: 'PageDown', vk: 34 },
  end: { code: 'End', vk: 35 },
  home: { code: 'Home', vk: 36 },
  arrowleft: { code: 'ArrowLeft', vk: 37 },
  arrowup: { code: 'ArrowUp', vk: 38 },
  arrowright: { code: 'ArrowRight', vk: 39 },
  arrowdown: { code: 'ArrowDown', vk: 40 },
  insert: { code: 'Insert', vk: 45 },
};

const SHIFTED_SYMBOLS: Record<string, string> = {
  '!': '1', '@': '2', '#': '3', '$': '4', '%': '5', '^': '6', '&': '7', '*': '8', '(': '9', ')': '0',
  '_': '-', '+': '=', '{': '[', '}': ']', ':': ';', '"': "'", '|': '\\', '<': ',', '>': '.', '?': '/', '~': '`',
};

/** 解析 'Control+A' / 'Enter' / 'a' 为完整 CDP 事件序列;非法键抛错 */
export function planKey(input: string): KeyPlan {
  const parts = input.split('+').map((p) => p.trim()).filter((p) => p.length > 0);
  if (parts.length === 0) throw new Error('INVALID_PARAMS: key 不能为空');

  let modifiers = 0;
  let keyPart = '';
  for (let i = 0; i < parts.length; i++) {
    const lower = parts[i].toLowerCase();
    if (i < parts.length - 1 && MODIFIER_BITS[lower] !== undefined) {
      modifiers |= MODIFIER_BITS[lower];
    } else if (i === parts.length - 1) {
      keyPart = parts[i];
    } else {
      throw new Error(`INVALID_PARAMS: 组合键中修饰键只能出现在末位键之前:${input}`);
    }
  }
  if (!keyPart) throw new Error(`INVALID_PARAMS: key 缺少主键:${input}`);

  const lower = keyPart.toLowerCase();
  const tableEntry = KEY_TABLE[lower];
  let events: CDPKeyEvent[];

  if (tableEntry) {
    const base: Omit<CDPKeyEvent, 'type'> = {
      key: keyPart.length === 1 ? keyPart : lower.charAt(0).toUpperCase() + lower.slice(1),
      code: tableEntry.code,
      windowsVirtualKeyCode: tableEntry.vk,
      nativeVirtualKeyCode: tableEntry.vk,
      modifiers,
      ...(tableEntry.text !== undefined && modifiers === 0 ? { text: tableEntry.text } : {}),
    };
    events = [
      { ...base, type: tableEntry.text !== undefined && modifiers === 0 ? 'keyDown' : 'rawKeyDown' },
      { ...base, type: 'keyUp' },
    ];
  } else if (keyPart.length === 1) {
    // 单字符:字母/数字/符号
    const isLetter = /[a-z]/i.test(keyPart);
    // 大写字母的 shift 语义:纯文本输入(无 Ctrl/Alt/Meta)时补 Shift;
    // 组合键(如 Control+A)是快捷键语义,不补 Shift
    const hasShortcutMod = (modifiers & (2 | 1 | 4)) !== 0;
    const needShift = SHIFTED_SYMBOLS[keyPart] !== undefined || (isLetter && keyPart !== lower && !hasShortcutMod);
    if (needShift) modifiers |= 8;
    const text = keyPart;
    const isShortcut = (modifiers & (2 | 1 | 4)) !== 0; // Ctrl/Alt/Meta 组合:快捷键语义,无文本产出
    const base: Omit<CDPKeyEvent, 'type'> = {
      key: keyPart,
      code: isLetter ? `Key${keyPart.toUpperCase()}` : SHIFTED_SYMBOLS[keyPart] !== undefined
        ? `Digit${SHIFTED_SYMBOLS[keyPart]}`
        : `Digit${/^\d$/.test(keyPart) ? keyPart : ''}`.trim() || `Key${keyPart.toUpperCase()}`,
      windowsVirtualKeyCode: isLetter ? keyPart.toUpperCase().charCodeAt(0) : /^\d$/.test(keyPart) ? 48 + Number(keyPart) : 0,
      nativeVirtualKeyCode: isLetter ? keyPart.toUpperCase().charCodeAt(0) : /^\d$/.test(keyPart) ? 48 + Number(keyPart) : 0,
      ...(isShortcut ? {} : { text }),
      ...(!isShortcut ? { unmodifiedText: needShift && SHIFTED_SYMBOLS[keyPart] ? SHIFTED_SYMBOLS[keyPart] : text.toLowerCase() } : {}),
      modifiers,
    };
    events = [
      { ...base, type: (isShortcut ? 'rawKeyDown' : 'keyDown') as CDPKeyEvent['type'] },
      { ...base, type: 'keyUp' },
    ];
  } else {
    throw new Error(`INVALID_PARAMS: 不支持的键名:${keyPart}(支持 Enter/Tab/Escape/Arrow*/Page*/Home/End/单字符/+ 组合)`);
  }

  return { modifiers, events };
}

/** 键名白名单(供参数校验/文档用) */
export const SUPPORTED_KEYS: readonly string[] = [
  'Enter', 'Tab', 'Escape', 'Backspace', 'Delete', 'Space',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'PageUp', 'PageDown', 'Home', 'End', 'Insert',
  '<单字符>', '<修饰键+键,如 Control+A / Shift+Enter>',
];
