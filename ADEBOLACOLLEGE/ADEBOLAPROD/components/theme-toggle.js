'use client';

import { useEffect, useState } from 'react';

export default function ThemeToggle({ className = '' }) {
  const [theme, setTheme] = useState(null);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-color-scheme: dark)');
    const followSystem = () => {
      try {
        const savedTheme = window.localStorage.getItem('adebola-theme');
        if (savedTheme === 'light' || savedTheme === 'dark') {
          document.documentElement.dataset.theme = savedTheme;
          setTheme(savedTheme);
          return;
        }
      } catch (error) {
        console.error('Unable to read theme preference.', error);
      }

      const systemTheme = preference.matches ? 'dark' : 'light';
      document.documentElement.dataset.theme = systemTheme;
      setTheme(systemTheme);
    };

    followSystem();
    preference.addEventListener('change', followSystem);
    return () => preference.removeEventListener('change', followSystem);
  }, []);

  function toggleTheme() {
    const root = document.documentElement;
    const currentTheme = root.dataset.theme;
    const isDark = currentTheme === 'dark'
      || (currentTheme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const nextTheme = isDark ? 'light' : 'dark';

    root.dataset.theme = nextTheme;
    setTheme(nextTheme);
    try {
      window.localStorage.setItem('adebola-theme', nextTheme);
    } catch (error) {
      console.error('Unable to save theme preference.', error);
    }
  }

  return (
    <button
      className={`theme-toggle ${className}`.trim()}
      type="button"
      aria-label={theme === 'dark' ? 'Switch to light theme' : theme === 'light' ? 'Switch to dark theme' : 'Toggle light and dark theme'}
      title={theme === 'dark' ? 'Switch to light theme' : theme === 'light' ? 'Switch to dark theme' : 'Toggle light and dark theme'}
      onClick={toggleTheme}
    >
      <svg className="theme-icon-light" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
      </svg>
      <svg className="theme-icon-dark" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20.2 15.1A8.5 8.5 0 0 1 8.9 3.8 8.5 8.5 0 1 0 20.2 15.1Z" />
      </svg>
    </button>
  );
}
