import type { Config } from 'tailwindcss'

/**
 * Dreamy design system — "a dark purple pillow".
 * Nearly-black aubergine backgrounds, muted violets, dusty amethyst accents,
 * warm off-white text, large radii, soft shadows.
 */
export default <Partial<Config>>{
  content: ['./app/**/*.{vue,js,ts,jsx,tsx}', './components/**/*.{vue,js,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        night: {
          950: '#0a0712',
          900: '#100b1b',
          850: '#151024',
          800: '#1b142c',
          700: '#251a38',
          600: '#312348',
        },
        plum: {
          900: '#2b1f45',
          800: '#392b5a',
          700: '#483672',
          600: '#58438c',
          500: '#6a53a4',
        },
        violet: {
          700: '#5f4a94',
          600: '#7159a8',
          500: '#856cb9',
          400: '#9b84ca',
        },
        lavender: {
          400: '#b6a2db',
          300: '#c9b8ea',
          200: '#dccdf4',
          100: '#ece2fa',
        },
        amethyst: {
          DEFAULT: '#a391d8',
          soft: '#8270b8',
          dim: '#5f4f8f',
          glow: '#6f5da8',
        },
        cream: {
          DEFAULT: '#f0e9f8',
          muted: '#cfc4e2',
          dim: '#a89cbf',
          faint: '#7c7194',
        },
      },
      // Opacity modifiers we lean on for soft surfaces.
      opacity: {
        4: '0.04',
        6: '0.06',
        7: '0.07',
        8: '0.08',
        9: '0.09',
        12: '0.12',
        92: '0.92',
      },
      fontFamily: {
        sans: [
          'ui-rounded',
          'SF Pro Rounded',
          'system-ui',
          '-apple-system',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
        display: [
          'ui-rounded',
          'SF Pro Rounded',
          'system-ui',
          '-apple-system',
          '"Segoe UI"',
          'sans-serif',
        ],
      },
      borderRadius: {
        pillow: '1.5rem',
        'pillow-sm': '1.125rem',
        'pillow-lg': '2.25rem',
        'pillow-xl': '2.75rem',
      },
      boxShadow: {
        soft: '0 24px 60px -24px rgba(8, 4, 16, 0.7)',
        'soft-lg': '0 36px 90px -28px rgba(8, 4, 16, 0.85)',
        lift: '0 18px 44px -18px rgba(8, 4, 16, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.04)',
        glow: '0 0 44px -10px rgba(140, 110, 200, 0.4)',
        'glow-strong': '0 0 70px -12px rgba(150, 118, 210, 0.55)',
        'inner-soft':
          'inset 0 1px 0 0 rgba(255, 255, 255, 0.07), inset 0 -1px 0 0 rgba(0, 0, 0, 0.4)',
      },
      backgroundImage: {
        'pillow-gradient':
          'linear-gradient(160deg, rgba(48, 34, 76, 0.55) 0%, rgba(28, 19, 46, 0.55) 45%, rgba(16, 11, 27, 0.6) 100%)',
        'pillow-card':
          'linear-gradient(165deg, rgba(58, 43, 90, 0.55) 0%, rgba(30, 21, 50, 0.6) 100%)',
      },
      transitionTimingFunction: {
        pillow: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      keyframes: {
        'float-slow': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-14px)' },
        },
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(14px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        aurora: {
          '0%, 100%': { transform: 'translate3d(0, 0, 0) scale(1)' },
          '33%': { transform: 'translate3d(5%, -7%, 0) scale(1.1)' },
          '66%': { transform: 'translate3d(-6%, 5%, 0) scale(0.94)' },
        },
        breathe: {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.85' },
          '50%': { transform: 'scale(1.05)', opacity: '1' },
        },
        'eq-bar': {
          '0%, 100%': { transform: 'scaleY(0.3)' },
          '50%': { transform: 'scaleY(1)' },
        },
        'spin-slow': {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
      },
      animation: {
        'float-slow': 'float-slow 9s ease-in-out infinite',
        'float-slower': 'float-slow 14s ease-in-out infinite',
        'fade-in-up': 'fade-in-up 0.55s cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fade-in 0.6s ease-out both',
        aurora: 'aurora 28s ease-in-out infinite',
        breathe: 'breathe 9s ease-in-out infinite',
        'eq-1': 'eq-bar 1.05s ease-in-out infinite',
        'eq-2': 'eq-bar 0.9s ease-in-out 0.1s infinite',
        'eq-3': 'eq-bar 1.2s ease-in-out 0.2s infinite',
        'eq-4': 'eq-bar 0.85s ease-in-out 0.05s infinite',
        'spin-slow': 'spin-slow 22s linear infinite',
        shimmer: 'shimmer 2.2s linear infinite',
      },
    },
  },
  plugins: [],
}
