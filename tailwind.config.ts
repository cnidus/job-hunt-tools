import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        clockwork: {
          50:  '#f0f5ff',
          100: '#e8f0fe',
          200: '#c5d5f5',
          500: '#578bdd',
          600: '#3d74cc',
          700: '#2a5bb5',
          900: '#1a3a6b',
        },
      },
    },
  },
  plugins: [],
}

export default config
