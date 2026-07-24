import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3002,
      host: '0.0.0.0',
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      tsconfigPaths: true,
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks(moduleId) {
            if (!moduleId.includes('node_modules')) return;
            if (
              moduleId.includes('/react/') ||
              moduleId.includes('/react-dom/') ||
              moduleId.includes('/react-router') ||
              moduleId.includes('/scheduler/')
            ) {
              return 'vendor';
            }
            if (
              moduleId.includes('/@supabase/') ||
              moduleId.includes('/react-hook-form/') ||
              moduleId.includes('/lucide-react/')
            ) {
              return 'utils';
            }
          }
        }
      }
    },
    publicDir: 'public'
  };
});
