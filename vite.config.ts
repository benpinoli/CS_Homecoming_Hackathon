import react from '@vitejs/plugin-react'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { fileURLToPath } from 'node:url'
import { defineConfig, type ViteDevServer } from 'vite'
import type { Connect } from 'vite'
import { scraperBridge } from './dev-server/scraperBridge.ts'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

function readJsonBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  return {
    root: 'src/frontend',
    build: {
      outDir: '../../dist',
    },
    plugins: [
      react(),
      scraperBridge(),
      {
        name: 'parse-resume-api',
        configureServer(server: ViteDevServer) {
          void import('./src/parse_resume_server.ts').then(
            ({ anthropicApiKeyStatus, loadResumeParserEnv }) => {
              const status = anthropicApiKeyStatus(loadResumeParserEnv(projectRoot, server.config.mode))
              if (status.loaded) {
                console.log(`[parse-resume] ANTHROPIC_API_KEY loaded (${status.length} chars)`)
              } else {
                console.warn(
                  '[parse-resume] ANTHROPIC_API_KEY not found in .env.local — parsing will fail until you add it.',
                )
              }
            },
          )

          server.middlewares.use(
            async (
              req: Connect.IncomingMessage,
              res: ServerResponse,
              next: Connect.NextFunction,
            ) => {
              const path = req.url?.split('?')[0]
              if (path !== '/api/parse-resume' || req.method !== 'POST') {
                next()
                return
              }

              try {
                const rawBody = await readJsonBody(req)
                const payload = JSON.parse(rawBody) as import('./src/parse_resume.ts').ParseResumeApiRequest

                if (
                  !payload?.profile_id ||
                  !payload?.person_entity_id ||
                  !payload?.captured_at ||
                  !Array.isArray(payload?.sources) ||
                  payload.sources.length === 0
                ) {
                  sendJson(res, 400, {
                    error: 'Invalid parse-resume request payload.',
                  })
                  return
                }

                const { runResumeParserOnServer, loadResumeParserEnv } = await import(
                  './src/parse_resume_server.ts'
                )
                const parserEnv = loadResumeParserEnv(projectRoot, server.config.mode ?? mode)
                const result = await runResumeParserOnServer(payload, parserEnv)
                sendJson(res, 200, result)
              } catch (error) {
                const message = error instanceof Error ? error.message : 'Resume parsing failed.'
                sendJson(res, 500, { error: message })
              }
            },
          )
        },
      },
    ],
  }
})
