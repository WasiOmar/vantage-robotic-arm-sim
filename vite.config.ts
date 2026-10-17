/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

// Serves the edge functions in /api during `vite` dev, so `npm run dev` works without
// `vercel dev`. Server-only secrets (OPENAI_API_KEY) from .env go into process.env here
// and never reach the browser bundle.
function localApi(): Plugin {
  return {
    name: 'local-api',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      const env = loadEnv(server.config.mode, server.config.root, '')
      for (const [k, v] of Object.entries(env)) {
        if (process.env[k] === undefined) process.env[k] = v
      }

      server.middlewares.use(async (req, res, next) => {
        const match = req.url?.match(/^\/api\/([\w-]+)(?:[/?]|$)/)
        if (!match) return next()
        const file = path.resolve(server.config.root, 'api', `${match[1]}.ts`)
        if (!fs.existsSync(file)) return next()

        try {
          const mod = await server.ssrLoadModule(file)
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(chunk as Buffer)
          const headers = new Headers()
          for (const [k, v] of Object.entries(req.headers)) {
            if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : v)
          }
          const method = req.method ?? 'GET'
          const request = new Request(`http://${req.headers.host ?? 'localhost'}${req.url}`, {
            method,
            headers,
            body: method === 'GET' || method === 'HEAD' ? undefined : Buffer.concat(chunks),
          })
          const response: Response = await mod.default(request)
          res.statusCode = response.status
          response.headers.forEach((value, key) => res.setHeader(key, value))
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (err) {
          server.config.logger.error(`[local-api] /api/${match[1]}: ${(err as Error).stack ?? err}`)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: (err as Error).message || 'Internal Server Error' }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), localApi()],
  test: {
    environment: 'happy-dom',
  },
})
