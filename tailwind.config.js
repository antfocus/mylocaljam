/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: '#0A0A0F',
          card: '#1A1A25',
          'card-hover': '#222233',
          elevated: '#252535',
          secondary: '#12121A',
          accent: '#FF6B35',
          'accent-2': '#FFD166',
          text: '#F0EDE6',
          'text-secondary': '#9994A8',
          'text-muted': '#666078',
        }
      },
      fontFamily: {
        display: ['Outfit', 'sans-serif'],
        body: ['DM Sans', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
