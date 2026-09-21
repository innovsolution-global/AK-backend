/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // Le thème est piloté par une classe sur <html>, pas par l'OS seul : la
  // bascule clair/sombre de l'interface doit l'emporter sur la préférence
  // système.
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Encre profonde (bleu nuit) pour les titres et les icônes.
        ink: {
          DEFAULT: '#14142b',
          soft: '#3d3d5c',
          muted: '#8a8a9e',
        },
        // Orange : couleur de marque, navigation active, actions principales.
        brand: {
          50: '#fff5ec',
          100: '#ffe8d1',
          200: '#ffcea3',
          300: '#ffab69',
          400: '#ff7a1a',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
        },
        // Violet : accent secondaire (icône de page, valeurs mises en avant).
        accent: {
          50: '#f5f3ff',
          100: '#ede9fe',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
        },
        // Vert : succès, variations positives, action de téléchargement.
        success: {
          50: '#ecfdf5',
          100: '#d1fae5',
          400: '#34d399',
          500: '#1dbf73',
          600: '#16a35e',
          700: '#0f7a46',
        },
        // Surfaces du thème sombre — trois paliers, du plan au relief.
        night: {
          900: '#151517',
          800: '#1e1e21',
          700: '#26262a',
          600: '#2f2f34',
          500: '#3a3a40',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      borderRadius: {
        // Le langage visuel repose sur des rayons généreux : cartes à 24 px,
        // panneau à 32 px, tout le reste en pilule.
        card: '1.5rem',
        panel: '2rem',
        pill: '9999px',
      },
      boxShadow: {
        card: '0 1px 2px rgb(20 20 43 / 0.03), 0 4px 16px rgb(20 20 43 / 0.04)',
        'card-hover': '0 2px 4px rgb(20 20 43 / 0.04), 0 12px 32px rgb(20 20 43 / 0.08)',
        // Halos colorés sous les actions principales, signature du design.
        'glow-brand': '0 10px 30px -8px rgb(249 115 22 / 0.65)',
        'glow-success': '0 10px 30px -8px rgb(29 191 115 / 0.6)',
        'glow-accent': '0 10px 30px -8px rgb(139 92 246 / 0.55)',
      },
      backgroundImage: {
        'gradient-brand': 'linear-gradient(135deg, #ff8a3d 0%, #f97316 50%, #ea580c 100%)',
        'gradient-success': 'linear-gradient(135deg, #34d399 0%, #1dbf73 100%)',
        'gradient-gauge': 'linear-gradient(90deg, #fde68a 0%, #fb923c 55%, #ea580c 100%)',
      },
      keyframes: {
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.4s infinite',
        'fade-up': 'fade-up 0.35s cubic-bezier(0.16, 1, 0.3, 1) both',
      },
    },
  },
  plugins: [],
};
