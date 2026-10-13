import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import { docsSite } from './src/site/docs/build/plugin.ts'

// The run site's build (rer build --site, src/site/pages.tsx): only the docs module and React.
// Never the app's vite.config.ts, whose Worker and Start plugins do not run in Node.
export default defineConfig({
  cacheDir: fileURLToPath(new URL('./.cache/vite-site', import.meta.url)),
  plugins: [docsSite(), react()],
})
