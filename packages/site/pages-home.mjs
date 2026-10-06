import { demote } from './build.mjs'
import { capsGridSection, decidesSection, devSection, fallbackSection, foot } from './pages-marketing.mjs'
import { ctaSection, limitsSection, proofSection } from './pages-docs.mjs'

/**
 * The homepage scroll, below the hero.
 *
 * The order is not a judgment call — it is the brief's, section 4, HOMEPAGE
 * STRUCTURE, in the order it lists:
 *
 *   1. the headline            (the hero, hand-written in index.html)
 *   2. the code sample         devSection
 *   3. the five capabilities   capsGridSection
 *   3b. the fallback flow      fallbackSection
 *   4. how it decides          decidesSection
 *   5. proof                   proofSection
 *   6. limits                  limitsSection
 *
 * Every block is the same markup the standalone page renders, demoted one
 * heading level. Nothing is re-authored here, so a fix to a section shows up in
 * both places and the scroll cannot drift away from the page it summarises.
 */
const HOME = [devSection, capsGridSection, fallbackSection, decidesSection, proofSection, limitsSection, ctaSection]

const homeSections = () => `${HOME.map((section) => demote(section())).join('\n')}\n${foot()}`

export { homeSections }
