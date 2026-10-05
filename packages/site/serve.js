import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, relative, resolve } from 'node:path'

/**
 * Static server for the marketing site.
 *
 * Deliberately trivial. In production this is a handful of files on any static
 * host, so nothing here needs a server of its own.
 */
// Serves the rendered site. Run 'node render.mjs' after changing any page.
const root = join(import.meta.dirname, 'dist')
const port = Number(process.env.PORT ?? 4173)

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
}

createServer(async (req, res) => {
  const requested = decodeURIComponent((req.url ?? '/').split('?')[0])

  // Same addressing as the deployed site: /docs is a folder, so it gets its
  // slash, and its pages' relative links then resolve inside it.
  if (requested === '/docs') {
    res.writeHead(308, { location: '/docs/' })
    res.end()
    return
  }
  // A folder serves its index; a path with no extension is a page.
  const target = requested.endsWith('/')
    ? `${requested.slice(1)}index.html`
    : extname(requested) === ''
      ? `${requested.slice(1)}.html`
      : requested.slice(1)
  const file = resolve(root, target)

  // Never serve outside the site directory, however the path was spelled.
  if (relative(root, file).startsWith('..')) {
    res.writeHead(403, { 'content-type': 'text/plain' })
    res.end('forbidden')
    return
  }

  try {
    const body = await readFile(file)
    res.writeHead(200, {
      'content-type': types[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    })
    res.end(body)
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end(`not found: ${target}`)
  }
})
  .listen(port, () => {
    console.log(`[quorum] site on http://localhost:${port}`)
    console.log('[quorum] marketing site at /, worker app at /app-signin, console at /console')
    console.log('[quorum] the app and console read the gateway on :8787 — start it with npm run gateway')
  })
  .on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`[quorum] port ${port} is already in use.`)
      console.error('[quorum] stop whatever is listening there, or run with PORT=4174.')
      process.exit(1)
    }
    throw error
  })
