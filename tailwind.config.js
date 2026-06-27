/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: We point to the folder structure we defined in Phase 1
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // The Pearl Ivory background (lower side)
        'vj-bg': "#FCFBF8", 
        
        // The Royal Ruby text/header color (upper side)
        'vj-text': "#5C1623", 
        
        // The Rich Gold accent color
        'vj-accent': "#D4AF37",
        
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