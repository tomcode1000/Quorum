import { mkdir, writeFile, copyFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { WORKER_APP } from './build.mjs'
import { homeSections } from './pages-home.mjs'
import { forWorkers, workerSignIn } from './pages-workers.mjs'
import { howItDecides, developers, capabilities } from './pages-marketing.mjs'
import { readings, real, matching, categorising, comparing } from './pages-capabilities.mjs'
import { proof, integration, docsHome, quickstart, firstRequest, response, nextSteps, capabilityReference } from './pages-docs.mjs'
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

await mkdir(join(out, 'docs'), { recursive: true })
await mkdir(join(out, 'assets'), { recursive: true })
await copyFile(join(root, 'assets/quorum.css'), join(out, 'assets/quorum.css'))

// Every page loads this: it is what replaces the rendered fallbacks with the
// gateway's real figures. Forgetting to copy it fails silently as a 404.
await copyFile(join(root, 'assets/live.js'), join(out, 'assets/live.js'))

// The two product surfaces share one stylesheet and one client. Both are copied
// rather than inlined so a browser caches them once across twenty-odd pages.
await copyFile(join(root, 'assets/app.css'), join(out, 'assets/app.css'))
await copyFile(join(root, 'assets/app.js'), join(out, 'assets/app.js'))

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
console.log(`rendered ${n} pages into dist/`)
