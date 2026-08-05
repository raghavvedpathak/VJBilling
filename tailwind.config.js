/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: We point to the folder structure we defined in Phase 1
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Warm Kesar Milk Silk background (anti-glare)
        'vj-bg': "#FDF9F3", 
        
        // Deep Burnt Saffron Velvet text/header color
        'vj-text': "#2A1208", 
        
        // Royal Auspicious Saffron Gold accent color
        'vj-accent': "#E67E22",

        // Auspicious Saffron accent color
        'vj-saffron': "#E67E22",
        
        // Active/Success green
        'vj-success': "#15803d",
        
        // Error/Archive red (for Safe Mode & destructive actions)
        'vj-danger': "#ef4444",
        
        // The glassmorphism background (bright glass for light backgrounds)
        'vj-glass': "rgba(255, 255, 255, 0.65)",
      },
      fontFamily: {
        // standard system fonts for now, can add custom fonts later
        sans: ["System"],
      }
    },
  },
  plugins: [],
}