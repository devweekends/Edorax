export type ThemePreference = 'light' | 'system' | 'dark';

const KEY = 'edorax-theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');

export function getThemePreference(): ThemePreference {
  try {
    const value = localStorage.getItem(KEY);
    if (value === 'light' || value === 'dark' || value === 'system') return value;
  } catch {
    /* Storage can be blocked; fall back to the system theme. */
  }
  return 'system';
}

export function applyTheme(preference: ThemePreference = getThemePreference()) {
  const dark = preference === 'dark' || (preference === 'system' && media.matches);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

export function setThemePreference(preference: ThemePreference) {
  try {
    localStorage.setItem(KEY, preference);
  } catch {
    /* The choice still applies for this session. */
  }
  applyTheme(preference);
}

export function initTheme() {
  applyTheme();
  media.addEventListener('change', () => {
    if (getThemePreference() === 'system') applyTheme('system');
  });
}
