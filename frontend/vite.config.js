import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {fileURLToPath} from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host:'localhost',
    fs:{strict:true,allow:[fileURLToPath(new URL('.',import.meta.url)),fileURLToPath(new URL('../node_modules',import.meta.url))],
      deny:['.env','.env.*','*.{crt,pem,key}','**/backend/**','**/database/**','**/.git/**','**/scripts/**']},
    port: 5173,
    // Keep the browser origin aligned with the backend's CLIENT_ORIGIN.
    // Fail clearly if occupied instead of silently switching to port 5174.
    strictPort: true,
    // Forward /api calls to the Express server so the browser sees one origin.
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
