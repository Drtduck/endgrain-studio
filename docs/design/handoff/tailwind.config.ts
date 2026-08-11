import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        app:      'var(--bg-app)',
        canvas:   'var(--bg-canvas)',
        surface: {
          DEFAULT: 'var(--surface)',
          raised:  'var(--surface-raised)',
          sunken:  'var(--surface-sunken)',
          panel:   'var(--surface-panel)',
        },
        ink: {
          DEFAULT:   'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted:     'var(--text-muted)',
          inverse:   'var(--text-inverse)',
        },
        line: {
          subtle:  'var(--border-subtle)',
          DEFAULT: 'var(--border-default)',
          strong:  'var(--border-strong)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          hover:   'var(--accent-hover)',
          active:  'var(--accent-active)',
          soft:    'var(--accent-soft)',
          border:  'var(--accent-border)',
          fg:      'var(--accent-fg)',
        },
        success: { DEFAULT:'var(--success)', soft:'var(--success-soft)', border:'var(--success-border)', text:'var(--success-text)' },
        warning: { DEFAULT:'var(--warning)', soft:'var(--warning-soft)', border:'var(--warning-border)', text:'var(--warning-text)' },
        error:   { DEFAULT:'var(--error)',   soft:'var(--error-soft)',   border:'var(--error-border)',   text:'var(--error-text)' },
      },
      fontFamily: {
        display: ['var(--font-bitter)', 'Georgia', 'serif'],
        sans:    ['var(--font-golos)', 'system-ui', 'sans-serif'],
        mono:    ['var(--font-jetbrains)', 'ui-monospace', 'monospace'],
      },
      borderRadius: { xs: '4px', sm: '6px', md: '8px', lg: '12px', xl: '16px' },
      boxShadow: {
        sm:     'var(--shadow-sm)',
        md:     'var(--shadow-md)',
        lg:     'var(--shadow-lg)',
        dialog: 'var(--shadow-dialog)',
        focus:  'var(--focus-ring)',
      },
      spacing: {
        0.5: '2px', 1: '4px', 1.5: '6px', 2: '8px', 3: '12px',
        4: '16px', 5: '20px', 6: '24px', 8: '32px', 10: '40px',
        12: '48px', 16: '64px',
      },
      transitionDuration: { fast:'80ms', hover:'120ms', panel:'160ms', modal:'240ms' },
      transitionTimingFunction: { out: 'cubic-bezier(0.2,0.6,0.2,1)' },
    },
  },
  plugins: [],
} satisfies Config;
