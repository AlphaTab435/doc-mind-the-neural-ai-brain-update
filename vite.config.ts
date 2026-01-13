import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Using path literal './' to bypass TypeScript errors regarding process.cwd() availability
  const env = loadEnv(mode, './', '');
  
  return {
    plugins: [react()],
    // Note: process.env.API_KEY is handled externally by the environment
  };
});