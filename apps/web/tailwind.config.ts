import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Slate palette mapped to CSS variables — automatically respects data-theme attribute.
        // Each variable holds space-separated RGB channels; Tailwind injects the alpha-value.
        slate: {
          950: 'rgb(var(--slate-950) / <alpha-value>)',
          900: 'rgb(var(--slate-900) / <alpha-value>)',
          800: 'rgb(var(--slate-800) / <alpha-value>)',
          700: 'rgb(var(--slate-700) / <alpha-value>)',
          600: 'rgb(var(--slate-600) / <alpha-value>)',
          500: 'rgb(var(--slate-500) / <alpha-value>)',
          400: 'rgb(var(--slate-400) / <alpha-value>)',
          300: 'rgb(var(--slate-300) / <alpha-value>)',
          200: 'rgb(var(--slate-200) / <alpha-value>)',
          100: 'rgb(var(--slate-100) / <alpha-value>)',
          50:  'rgb(var(--slate-50)  / <alpha-value>)',
        },
        teal: {
          950: '#042f2e',
          900: '#134e4a',
          800: '#115e59',
          700: '#0f766e',
          600: '#0d9488',
          500: '#14b8a6',
          400: '#2dd4bf',
          300: '#5eead4',
          200: '#99f6e4',
          100: '#ccfbf1',
          50:  '#f0fdfa',
        },
        amber: {
          500: '#f59e0b',
          400: '#fbbf24',
          300: '#fcd34d',
        },
        red: {
          600: '#dc2626',
          500: '#ef4444',
          400: '#f87171',
          300: '#fca5a5',
        },
        green: {
          600: '#16a34a',
          500: '#22c55e',
          400: '#4ade80',
        },
      },
      fontFamily: {
        display: ['var(--font-syne)', 'system-ui', 'sans-serif'],
        body:    ['var(--font-dm-sans)', 'system-ui', 'sans-serif'],
        sans:    ['var(--font-dm-sans)', 'system-ui', 'sans-serif'],
        mono:    ['ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        'card':      '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
        'card-lg':   '0 10px 30px -5px rgba(0,0,0,0.5)',
        'glow-teal': '0 0 20px rgba(20,184,166,0.25)',
        'glow-blue': '0 0 20px rgba(59,130,246,0.25)',
      },
      animation: {
        'shimmer':  'shimmer 1.5s infinite',
        'fade-in':  'fadeIn 0.15s ease-out',
        'scale-in': 'scaleIn 0.15s ease-out',
        'fade-up':  'fadeUp 0.3s ease-out both',
      },
      keyframes: {
        shimmer: {
          '0%':   { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to:   { opacity: '1', transform: 'scale(1)' },
        },
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
