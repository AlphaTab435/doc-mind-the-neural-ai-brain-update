
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load environment variables from the root directory
  const env = loadEnv(mode, './', '');
  
  // Prioritize VITE_API_KEY for standards, fallback to API_KEY
  const apiKey = env.VITE_API_KEY || env.API_KEY || '';

  return {
    plugins: [react()],
    // Removed define block for process.env.API_KEY to rely on platform-injected environment variables as per guidelines
    server: {
      port: 3000
    },
    build: {
      outDir: 'dist',
      sourcemap: false
    }
  };
});
