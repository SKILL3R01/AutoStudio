import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // The Colab notebook (../engine) is bundled into the app as a download fallback.
  server: { port: 5173, fs: { allow: ['..'] } },
});
