/*
  Live figures.

  Every number on this site that can be wrong is read from the running gateway
  rather than typed into the markup. If the gateway is unreachable the page keeps
  whatever the server rendered, which is why the fallbacks in the HTML are honest
  values and not aspirational ones.

  The gateway is assumed to be on port 8787 of whatever host served this page,
  matching the worker app. Override with ?gateway=https://…
*/

/** Cents as a reader says them: 80¢, or $5.00 once past a dollar. */
const price = (cents) => (cents < 100 ? `${cents}\u00a2` : `$${(cents / 100).toFixed(2)}`)

const gateway = (() => {
  const explicit = new URL(document.baseURI).searchParams.get('gateway')
  if (explicit) return explicit.replace(/\/$/, '')
  if (location.port === '8787') return location.origin
  return `${location.protocol}//${location.hostname}:8787`
})()

const set = (key, value) => {
  for (const el of document.querySelectorAll(`[data-live="${key}"]`)) el.textContent = value
}

const mark = (state) => {
  for (const el of document.querySelectorAll('[data-live-status]')) {
    el.dataset.liveStatus = state
    el.title = state === 'up' ? 'Live from the gateway' : 'Gateway unreachable — showing last known values'
  }
}

async function refresh() {
  try {
    const health = await fetch(`${gateway}/health`, { signal: AbortSignal.timeout(4000) }).then((r) => r.json())

    set('workers', String(health.workersOnline ?? 0))
    set('network', health.network ?? 'Tempo')
    set('inflight', String(health.questionsInFlight ?? 0))

    // A network with nobody on it should say so rather than implying capacity.
    for (const el of document.querySelectorAll('[data-live="workers-label"]'))
      el.textContent = health.workersOnline === 1 ? 'Worker online' : 'Workers online'

    mark('up')
  } catch {
    mark('down')
    return
  }

  try {
    const caps = await fetch(`${gateway}/v1/capabilities`, { signal: AbortSignal.timeout(4000) }).then((r) => r.json())
    const live = caps.capabilities.filter((c) => c.servable)
    set('capabilities', String(live.length))

    // The catalog is the source of truth for what is callable; a card for a
    // capability the gateway will refuse is worse than no card at all.
    for (const card of document.querySelectorAll('[data-capability]')) {
      const found = caps.capabilities.find((c) => c.id === card.dataset.capability)
      const badge = card.querySelector('[data-cap-state]')
      if (!badge) continue
      if (!found) {
        badge.textContent = 'Unknown'
        badge.className = 'badge'
      } else if (found.servable) {
        badge.textContent = `${price(found.price_cents.min)}–${price(found.price_cents.max)} a question`
        badge.className = 'badge badge-accent'
      } else {
        badge.textContent = 'No workforce yet'
        badge.className = 'badge badge-bad'
      }
    }
  } catch {
    /* Capabilities are a nicety; health already told us the gateway is up. */
  }
}

refresh()
setInterval(refresh, 15000)
