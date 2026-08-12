import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    proxy: {
      '/api': { target: 'http://localhost:4040', timeout: 300000 },
      '/uploads': { target: 'http://localhost:4040', timeout: 60000 },
    },
  },
});