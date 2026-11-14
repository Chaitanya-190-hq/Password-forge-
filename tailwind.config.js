/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#111216',
        surface: '#1D2026',
        elevated: '#292C33',
        gold: {
          DEFAULT: '#C5A36B',
          soft: '#D9C29C',
          deep: '#8F7343',
        },
        parchment: '#EAE7DF',
        muted: '#9699A3',
        line: 'rgba(234, 231, 223, 0.08)',
        linedark: 'rgba(0, 0, 0, 0.35)',
        danger: '#C0574F',
        success: '#6E9C7C',
        warn: '#C79B57',
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        display: [
          'Iowan Old Style',
          'Palatino Linotype',
          'Palatino',
          'Georgia',
          'Times New Roman',
          'serif',
        ],
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'SF Mono',
          'Menlo',
          'Consolas',
          'Liberation Mono',
          'monospace',
        ],
      },
      boxShadow: {
        panel: '0 1px 0 0 rgba(255,255,255,0.03) inset, 0 18px 40px -24px rgba(0,0,0,0.85)',
        lift: '0 24px 60px -30px rgba(0,0,0,0.9)',
        gold: '0 0 0 1px rgba(197,163,107,0.35)',
      },
      borderRadius: {
        xl2: '1.15rem',
      },
      keyframes: {
        rise: {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fade: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        rise: 'rise 220ms ease-out both',
        fade: 'fade 180ms ease-out both',
      },
    },
  },
  plugins: [],
};
