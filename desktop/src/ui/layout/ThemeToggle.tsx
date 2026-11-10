import { useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { setThemePreference } from '../lib/theme';

// One button in the top bar: shows the theme you will switch to.
export function ThemeToggle() {
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains('dark'),
  );

  function toggle() {
    const next = !dark;
    setDark(next);
    setThemePreference(next ? 'dark' : 'light');
  }

  const label = dark ? 'Switch to light theme' : 'Switch to dark theme';
  return (
    <button
      onClick={toggle}
      aria-label={label}
      title={label}
      className="flex size-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-muted"
    >
      {dark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
