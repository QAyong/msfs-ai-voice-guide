import { z } from 'zod';

export const globalPushToTalkPresetKeys = [
  'AltLeft',
  'F8',
  'F9',
  'ControlRight',
  'CapsLock',
  'Space',
  'MouseX1',
  'MouseX2',
] as const;

export type GlobalPushToTalkPresetKey = (typeof globalPushToTalkPresetKeys)[number];

const customKeyboardKeyPattern =
  /^(?:Key[A-Z]|Digit[0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Numpad(?:[0-9]|Add|Subtract|Multiply|Divide|Decimal|Enter)|Escape|Tab|Enter|Backspace|Insert|Delete|Home|End|PageUp|PageDown|Arrow(?:Up|Down|Left|Right)|PrintScreen|Pause|ScrollLock|NumLock|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Backquote|Comma|Period|Slash)$/;

const blockedCustomKeyboardKeys = new Set([
  'AltRight',
  'ControlLeft',
  'ControlRight',
  'ShiftLeft',
  'ShiftRight',
  'MetaLeft',
  'MetaRight',
  'ContextMenu',
]);

export const isGlobalPushToTalkKey = (value: unknown): value is string =>
  typeof value === 'string' &&
  (globalPushToTalkPresetKeys.includes(value as GlobalPushToTalkPresetKey) ||
    (customKeyboardKeyPattern.test(value) && !blockedCustomKeyboardKeys.has(value)));

export const globalPushToTalkKeySchema = z
  .string()
  .trim()
  .max(32)
  .refine(isGlobalPushToTalkKey, { message: '不支持的全局按住说话键。' });
export type GlobalPushToTalkKey = z.infer<typeof globalPushToTalkKeySchema>;

export const globalPushToTalkConfigurationSchema = z
  .object({
    key: globalPushToTalkKeySchema,
    enabled: z.boolean(),
  })
  .strict();
export type GlobalPushToTalkConfiguration = z.infer<typeof globalPushToTalkConfigurationSchema>;

export type GlobalPushToTalkEvent = { type: 'press' | 'release' | 'cancel' };

export type GlobalPushToTalkStatus = {
  available: boolean;
  active: boolean;
  message?: string;
};

export const globalPushToTalkKeyLabel = (key: string): string => {
  const labels: Record<string, string> = {
    AltLeft: 'Left Alt',
    F8: 'F8',
    F9: 'F9',
    ControlRight: 'Right Ctrl',
    CapsLock: 'Caps Lock',
    Space: 'Space',
    MouseX1: 'Mouse X1',
    MouseX2: 'Mouse X2',
  };
  return labels[key] ?? key;
};
