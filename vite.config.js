import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  server: {allowedHosts: ['fine-ends-drum.loca.lt']},
  plugins: [react(),tailwindcss(),],
  base: "/Netflix-Web-App",
  optimizeDeps: {
    include: ['@stripe/stripe-js'], // Ensure Stripe JS is pre-bundled
  },
})
