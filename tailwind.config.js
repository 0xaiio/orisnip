/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        rice: '#F8F3E9',
        'rice-deep': '#F1E9DA',
        cinnabar: '#B93645',
        vermilion: '#D84A49',
        ink: '#242725',
        gold: '#C9A46A',
        jade: '#378C86',
        'paper-grey': '#E5DED0',
      },
      fontFamily: {
        display: ['"Songti SC"', '"STSong"', '"Noto Serif SC"', '"Source Han Serif SC"', '"SimSun"', 'Georgia', 'serif'],
        sans: ['"PingFang SC"', '"Hiragino Sans GB"', '"Microsoft YaHei"', 'system-ui', 'sans-serif'],
        mono: ['"SFMono-Regular"', 'Consolas', '"Liberation Mono"', 'monospace'],
      },
      boxShadow: {
        paper: '0 1px 2px rgba(36,39,37,0.06), 0 12px 32px -12px rgba(36,39,37,0.22)',
        lift: '0 2px 4px rgba(36,39,37,0.05), 0 24px 48px -20px rgba(36,39,37,0.3)',
      },
      transitionTimingFunction: {
        paper: 'cubic-bezier(0.22, 0.61, 0.24, 1)',
      },
    },
  },
  plugins: [],
};
