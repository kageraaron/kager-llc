import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#f7f7f8',
          100: '#eeeef1',
          200: '#d9dae0',
          300: '#b8babf',
          400: '#8e919a',
          500: '#6b6e78',
          600: '#4f525c',
          700: '#3a3d46',
          800: '#26282f',
          900: '#15161b',
          950: '#0a0a0d',
        },
        accent: {
          DEFAULT: '#7c5cff',
          hover: '#6747f0',
        },
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
