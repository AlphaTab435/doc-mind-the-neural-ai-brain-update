
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load variables from the environment (Netlify or local .env)
  const env = loadEnv(mode, '.', '');

  return {
    plugins: [react()],
    // Security: We define the variable so Vite replaces it during build.
    // This allows the SDK to use process.env.API_KEY as required.
    define: {
      'process.env.API_KEY': JSON.stringify(env.VITE_API_KEY || env.API_KEY || ''),
      // Shim the process object for libraries that expect it
      'process.env': {
        API_KEY: JSON.stringify(env.VITE_API_KEY || env.API_KEY || '')
      }
    },
    server: {
      port: 3000
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      minify: 'esbuild',
      // Ensure the generated chunks use the shimmed variables correctly
      target: 'esnext'
    }
  };
});
