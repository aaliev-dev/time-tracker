/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/renderer/index.html',
    './src/renderer/src/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        'tt-bg': '#1a1b26',
        'tt-surface': '#24283b',
        'tt-border': '#414868',
        'tt-text': '#c0caf5',
        'tt-muted': '#565f89',
        'tt-accent': '#7aa2f7',
        'tt-green': '#9ece6a',
        'tt-yellow': '#e0af68',
        'tt-red': '#f7768e',
        'tt-purple': '#bb9af7'
      }
    }
  },
  plugins: []
}
