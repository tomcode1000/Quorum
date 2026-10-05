import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/**
 * Where the worker roster is kept between runs.
 *
 * The roster is one small JSON document: every worker, their skills, their
 * record and their payment history. Everything else the gateway holds is either
 * on chain already or does not need to outlive a restart. So it needs a place to
 * read one document from and write it back to, and nothing more.
 *
 * A file is the default and is right for development. A host that throws its disk
 * away on every restart (Render's free plan, for one) needs the document kept
 * somewhere else, which is what the Upstash store is for.
 */
export type Persistence = {
  /** Where this is, for the startup log. */
  readonly label: string
  /** The saved document, or null when nothing has been saved yet. */
  read(): Promise<string | null>
  write(text: string): Promise<void>
}

export function fileStore(path: string): Persistence {
  return {
    label: path,
    async read() {
      try {
        return await readFile(path, 'utf8')
      } catch {
        return null
      }
    },
    async write(text) {
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, text)
    },
  }
}

/**
 * Upstash Redis, over its REST API: one key, read and written whole.
 *
 * No client library, because two commands do not need one: a command is a JSON
 * array posted to the database URL with the token as a bearer credential.
 */
export function upstashStore(options: { url: string; token: string; key?: string }): Persistence {
  const key = options.key ?? 'quorum:roster'
  const command = async (args: string[]) => {
    const response = await fetch(options.url, {
      method: 'POST',
      headers: { authorization: `Bearer ${options.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(args),
    })
    const body = (await response.json().catch(() => ({}))) as { result?: unknown; error?: string }
    if (!response.ok || body.error) throw new Error(`Upstash ${args[0]} failed: ${body.error ?? response.status}`)
    return body.result
  }
  return {
    label: `Upstash Redis (${new URL(options.url).hostname})`,
    async read() {
      const result = await command(['GET', key])
      return typeof result === 'string' ? result : null
    },
    async write(text) {
      await command(['SET', key, text])
    },
  }
}
