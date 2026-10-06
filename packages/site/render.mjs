import { mkdir, writeFile, copyFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { WORKER_APP } from './build.mjs'
import { homeSections } from './pages-home.mjs'
import { forWorkers, workerSignIn } from './pages-workers.mjs'
import { howItDecides, developers, capabilities } from './pages-marketing.mjs'
import { readings, real, matching, categorising, comparing } from './pages-capabilities.mjs'
import { proof, integration, docsHome, quickstart, firstRequest, response, nextSteps, capabilityReference } from './pages-docs.mjs'
import { workers, confidence, pricing, endpoints, schemas, errors, help } from './pages-docs-ref.mjs'
import {
  home as appHome,
  question as appQuestion,
  submitted as appSubmitted,
  closed as appClosed,
  earnings as appEarnings,
  payments as appPayments,
  profile as appProfile,
  help as appHelp,
  settings as appSettings,
  assessment as appAssessment,
  assessmentQuestion as appAssessmentQuestion,
  assessmentPassed as appAssessmentPassed,
  assessmentFailed as appAssessmentFailed,
  signIn as appSignIn,
  skills as appSkills,
} from './pages-app.mjs'
import {
  liveActivity,
  escalations as consoleEscalations,
  questions as consoleQuestions,
  questionDetail,
  workers as consoleWorkers,
  workerDetail,
  paymentsPage as consolePayments,
  capabilitiesPage as consoleCapabilities,
  analytics as consoleAnalytics,
  consoleSettings,
} from './pages-console.mjs'

/** Renders every page. The homepage is hand-written and copied through. */
const root = import.meta.dirname
const out = join(root, 'dist')

const PAGES = {
  'how-it-decides.html': howItDecides,
  'developers.html': developers,
  'capabilities.html': capabilities,
  'capability-readings.html': readings,
  'capability-real.html': real,
  'capability-matching.html': matching,
  'capability-categorising.html': categorising,
  'capability-comparing.html': comparing,
  'proof.html': proof,
  'for-workers.html': forWorkers,
  'worker-signin.html': workerSignIn,
  'integration.html': integration,
  'docs/index.html': docsHome,
  'docs/quickstart.html': quickstart,
  'docs/first-request.html': firstRequest,
  'docs/response.html': response,
  'docs/next-steps.html': nextSteps,
  'docs/capability-reference.html': capabilityReference,
  'docs/workers.html': workers,
  'docs/confidence.html': confidence,
  'docs/pricing.html': pricing,
  'docs/endpoints.html': endpoints,
  'docs/schemas.html': schemas,
  'docs/errors.html': errors,
  'docs/help.html': help,

  /*
    The worker app — surface A.

    Static HTML like everything else. Each page is wired to the gateway by
    assets/app.js at runtime, so there is no build step, no framework and
    nothing to hydrate on a phone that is already struggling.
  */
  'app-signin.html': appSignIn,
  'app-skills.html': appSkills,
  'app-home.html': appHome,
  'app-question.html': appQuestion,
  'app-submitted.html': appSubmitted,
  'app-closed.html': appClosed,
  'app-earnings.html': appEarnings,
  'app-payments.html': appPayments,
  'app-profile.html': appProfile,
  'app-help.html': appHelp,
  'app-settings.html': appSettings,
  'app-assessment.html': appAssessment,
  'app-assessment-question.html': appAssessmentQuestion,
  'app-assessment-passed.html': appAssessmentPassed,
  'app-assessment-failed.html': appAssessmentFailed,

  /* The operator console — surface C. */
  'console.html': liveActivity,
  'console-questions.html': consoleQuestions,
  'console-question.html': questionDetail,
  'console-workers.html': consoleWorkers,
  'console-worker.html': workerDetail,
  'console-payments.html': consolePayments,
  'console-escalations.html': consoleEscalations,
  'console-capabilities.html': consoleCapabilities,
  'console-analytics.html': consoleAnalytics,
  'console-settings.html': consoleSettings,
}

/*
  Where the deployed site finds the gateway. A static host such as Vercel serves
  the pages and the gateway runs elsewhere, so its address is written into the
  two scripts that call it. Unset, they keep their placeholder and look for the
  gateway on port 8787 of the same host, which is the development setup.
*/
const GATEWAY_URL = process.env.QUORUM_GATEWAY_URL ?? ''
const copyWithGateway = async (file) => {
  const text = await readFile(join(root, file), 'utf8')
  await writeFile(join(out, file), GATEWAY_URL ? text.replaceAll('__QUORUM_GATEWAY_URL__', GATEWAY_URL) : text)
}

await mkdir(join(out, 'docs'), { recursive: true })
await mkdir(join(out, 'assets'), { recursive: true })
await copyFile(join(root, 'assets/quorum.css'), join(out, 'assets/quorum.css'))

// Every page loads this: it is what replaces the rendered fallbacks with the
// gateway's real figures. Forgetting to copy it fails silently as a 404.
await copyWithGateway('assets/live.js')

// The two product surfaces share one stylesheet and one client. Both are copied
// rather than inlined so a browser caches them once across twenty-odd pages.
await copyFile(join(root, 'assets/app.css'), join(out, 'assets/app.css'))
await copyWithGateway('assets/app.js')

// The brand mark as the tab icon, from the same geometry as every mark on the page.
await copyFile(join(root, '../../brand/favicon.svg'), join(out, 'assets/favicon.svg'))

// The worker photographs, cropped from the comps.
for (const photo of ['hero', 'why', 'trust', 'join', 'signin'])
  await copyFile(join(root, `assets/worker-${photo}.webp`), join(out, `assets/worker-${photo}.webp`))

// The homepage keeps its own stylesheet and its own hand-written markup, so it
// is copied rather than rendered. The one thing it cannot hardcode is where the
// worker app lives, so that is substituted here from the same constant the
// generated pages use.
const home = await readFile(join(root, 'index.html'), 'utf8')
// The hero is hand-written; the rest of the scroll is the same sections the
// standalone pages render, spliced in ahead of the closing </main>.
const scrolled = home.replace('</main>', `${homeSections()}
</main>`)
await writeFile(join(out, 'index.html'), scrolled.replaceAll('{{WORKER_APP}}', WORKER_APP))

let n = 1
for (const [file, render] of Object.entries(PAGES)) {
  await writeFile(join(out, file), render())
  n += 1
}

// Pages are addressed without their extension (/app-home, not /app-home.html),
// so every link is written that way here rather than in each template. Vercel
// serves them with cleanUrls; serve.js does the same locally.
const clean = (text) =>
  text
    .replace(/((?:\.\.\/)?(?:docs\/)?)index\.html(?=["'`?#])/g, (_, before) => before || './')
    .replace(/([A-Za-z0-9_-]+)\.html(?=["'`?#])/g, '$1')
for (const file of [
  'index.html',
  ...Object.keys(PAGES),
  'assets/app.js',
  'assets/live.js',
]) {
  const path = join(out, file)
  await writeFile(path, clean(await readFile(path, 'utf8')))
}
// The docs search index: every docs page, split at its headings.
const strip = (html) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&rsquo;/g, '’')
    .replace(/&amp;/g, '&')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
const searchIndex = []
for (const file of Object.keys(PAGES).filter((f) => f.startsWith('docs/'))) {
  const html = await readFile(join(out, file), 'utf8')
  const main = html.match(/<main class="docs-main">([\s\S]*?)<\/main>/)?.[1] ?? ''
  const pageTitle = strip(main.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? '')
  const href = file.slice('docs/'.length).replace(/\.html$/, '').replace(/^index$/, './')
  for (const part of main.split(/(?=<h2\b)/)) {
    const h = part.match(/^<h2[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/h2>/)
    searchIndex.push({
      page: pageTitle,
      heading: h ? strip(h[2]) : '',
      href: h ? `${href}#${h[1]}` : href,
      text: strip(h ? part.slice(h[0].length) : part.replace(/<h1[\s\S]*?<\/h1>/, '')),
    })
  }
}
await writeFile(join(out, 'docs/search.json'), JSON.stringify(searchIndex))
await copyFile(join(root, 'assets/docs-search.js'), join(out, 'assets/docs-search.js'))

console.log(`rendered ${n} pages into dist/`)
