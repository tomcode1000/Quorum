/*
  Docs search.

  The index is every docs page split at its headings, written at build time to
  docs/search.json. A dozen pages is small enough to search in the browser, so
  there is no service behind this: open with the box, Ctrl/Cmd+K or "/", type,
  and Enter goes to the highlighted match.
*/
;(() => {
  // Beside this script, so it resolves the same from /docs and from /docs/pricing.
  const indexUrl = new URL('../docs/search.json', document.currentScript.src)
  const trigger = document.querySelector('[data-docs-search]')
  if (!trigger) return

  let index = null
  const load = () =>
    index ??
    (index = fetch(indexUrl)
      .then((r) => r.json())
      .catch(() => []))

  const dialog = document.createElement('div')
  dialog.className = 'ds-backdrop'
  dialog.hidden = true
  dialog.innerHTML = `<div class="ds-panel" role="dialog" aria-modal="true" aria-label="Search docs">
    <input class="ds-input" type="search" placeholder="Search docs…" autocomplete="off" aria-label="Search docs"/>
    <div class="ds-results" role="listbox"></div>
  </div>`
  document.body.append(dialog)
  const input = dialog.querySelector('.ds-input')
  const results = dialog.querySelector('.ds-results')

  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  const mark = (text, words) => {
    let out = esc(text)
    for (const w of words) out = out.replace(new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'), '<mark>$1</mark>')
    return out
  }
  const snippet = (text, word) => {
    const at = text.toLowerCase().indexOf(word)
    const start = Math.max(0, at - 40)
    return (start ? '…' : '') + text.slice(start, start + 120) + (start + 120 < text.length ? '…' : '')
  }

  let active = 0
  const render = async () => {
    const entries = await load()
    const words = input.value.toLowerCase().split(/\s+/).filter(Boolean)
    if (!words.length) {
      results.innerHTML = '<p class="ds-empty">Type to search every docs page.</p>'
      return
    }
    const scored = entries
      .map((e) => {
        const heading = e.heading.toLowerCase()
        const page = e.page.toLowerCase()
        const body = e.text.toLowerCase()
        let score = 0
        for (const w of words) {
          if (heading.includes(w)) score += 6
          else if (page.includes(w)) score += 3
          else if (body.includes(w)) score += 1
          else return null
        }
        return { e, score }
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
    active = 0
    results.innerHTML = scored.length
      ? scored
          .map(
            ({ e }, x) => `<a class="ds-hit" role="option" href="${e.href}"${x === 0 ? ' aria-selected="true"' : ''}>
        <b>${mark(e.page, words)}${e.heading ? ` <span>› ${mark(e.heading, words)}</span>` : ''}</b>
        <small>${mark(snippet(e.text, words[0]), words)}</small></a>`,
          )
          .join('')
      : `<p class="ds-empty">Nothing matches “${esc(input.value)}”.</p>`
  }

  const open = () => {
    dialog.hidden = false
    input.value = ''
    render()
    input.focus()
  }
  const close = () => {
    dialog.hidden = true
    trigger.focus()
  }

  trigger.addEventListener('click', open)
  dialog.addEventListener('click', (e) => e.target === dialog && close())
  input.addEventListener('input', render)
  input.addEventListener('keydown', (e) => {
    const hits = [...results.querySelectorAll('.ds-hit')]
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!hits.length) return
      hits[active]?.removeAttribute('aria-selected')
      active = (active + (e.key === 'ArrowDown' ? 1 : hits.length - 1)) % hits.length
      hits[active].setAttribute('aria-selected', 'true')
      hits[active].scrollIntoView({ block: 'nearest' })
    } else if (e.key === 'Enter' && hits[active]) location.href = hits[active].href
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !dialog.hidden) return close()
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '')
    if (((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing)) {
      e.preventDefault()
      dialog.hidden ? open() : close()
    }
  })
  if (!/Mac|iPhone|iPad/.test(navigator.platform)) trigger.querySelector('kbd').textContent = 'Ctrl K'
})()
