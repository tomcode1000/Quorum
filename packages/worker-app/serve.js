import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, relative, resolve } from 'node:path'

/**
 * A static file server for the worker app during development.
 *
 * Deliberately trivial. In production this is a handful of files on any static host —
 * nothing here needs a server of its own, which is part of why the app can be made to
 * load quickly on a cheap phone.
 */
const root = import.meta.dirname
const port = Number(process.env.PORT ?? 5173)

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
}

createServer(async (req, res) => {
  const requested = decodeURIComponent((req.url ?? '/').split('?')[0])
  const target = requested === '/' ? 'index.html' : requested.slice(1)
  const file = resolve(root, target)

  // Never serve outside the app directory, however the path was spelled.
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
}).listen(port, () => {
  console.log(`[quorum] worker app on http://localhost:${port}`)
  console.log('[quorum] the app calls the gateway on its own origin by default;')
  console.log(`[quorum] open http://localhost:${port}/?gateway=http://localhost:8787 if the gateway is elsewhere`)
})
