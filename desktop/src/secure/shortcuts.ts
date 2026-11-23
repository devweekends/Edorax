// Kept free of Electron so it can be tested on its own.

export type Keys = {
  key: string;
  control: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
};

/**
 * Shortcuts the exam window refuses: developer tools, reload, print, save and view-source.
 * Copy, paste and cut are not here on purpose; the quiz hook blocks and records those.
 */
export function isBlockedShortcut(input: Keys): boolean {
  const key = input.key.toLowerCase();
  const command = input.control || input.meta;
  if (key === 'f12' || key === 'f5') return true;
  if (command && input.shift && ['i', 'j', 'c'].includes(key)) return true;
  if (input.meta && input.alt && key === 'i') return true;
  return command && ['p', 's', 'r', 'u'].includes(key);
}
