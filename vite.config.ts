
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load variables from the environment (Netlify or local .env)
  // Use '.' instead of process.cwd() to resolve the typing error while maintaining standard Vite root detection.
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
      minify: 'esbuild'
    }
  };
});
