import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load environment variables from the root directory
  const env = loadEnv(mode, './', '');
  
  return {
    plugins: [react()],
    define: {
      // Shimming process.env.API_KEY for browser compatibility
      // This maps the required process.env.API_KEY to the VITE_ prefixed variable used in deployment
      'process.env.API_KEY': JSON.stringify(env.VITE_API_KEY || env.API_KEY)
    }
  };
});