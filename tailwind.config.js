/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: We point to the folder structure we defined in Phase 1
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // The "Soft Cream" background from your screenshot
        'vj-bg': "#FAF3E0", 
        
        // The "Deep Espresso" text/header color
        'vj-text': "#2E1D00", 
        
        // The "Metallic Copper" button/badge color
        'vj-accent': "#B87333",
        
        // Active/Success green
        'vj-success': "#15803d",
        
        // Error/Archive red (for Safe Mode & destructive actions)
        'vj-danger': "#ef4444",
        
        // The glassmorphism background
        'vj-glass': "rgba(255, 255, 255, 0.4)",
      },
      fontFamily: {
        // standard system fonts for now, can add custom fonts later
        sans: ["System"],
      }
    },
  },
  plugins: [],
}