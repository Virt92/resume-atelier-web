/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"Fraunces"', 'Georgia', 'serif']
      },
      colors: {
        ink: {
          50: '#f7f7f8',
          100: '#eceef1',
          200: '#d7dbe1',
          300: '#b3bac5',
          400: '#8891a1',
          500: '#646d7d',
          600: '#4a5262',
          700: '#373d4a',
          800: '#242935',
          900: '#14171f',
          950: '#0b0d13'
        },
        accent: {
          50: '#f4efff',
          100: '#e5d9ff',
          200: '#ccb3ff',
          300: '#ad85ff',
          400: '#8f58ff',
          500: '#7234ff',
          600: '#5d1fe0',
          700: '#4b17b4',
          800: '#3a1187',
          900: '#2b0c63'
        }
      },
      boxShadow: {
        soft: '0 1px 2px rgba(14,17,23,0.04), 0 6px 20px rgba(14,17,23,0.08)',
        lift: '0 2px 4px rgba(14,17,23,0.06), 0 16px 40px rgba(14,17,23,0.12)'
      }
    }
  },
  plugins: []
}
