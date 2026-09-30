import { SERVABLE_KINDS, type Kind } from '@quorum/core'

/**
 * What a worker has chosen to do, and how far each choice has got.
 *
 * A worker picks the kinds of question they want, the way anyone picks what to
 * offer on a marketplace, and takes a short assessment in each. Only a passed skill
 * brings work: routing never sends a kind of question to somebody who has not shown
 * they can answer it.
 *
 *   chosen   picked, assessment not yet finished
 *   passed   assessed and passed; this kind of work can reach them
 *   failed   assessed and not passed; closed, and not retaken, because a test that
 *            can be retaken until it is passed teaches its answers
 */
export type SkillState = 'chosen' | 'passed' | 'failed'
export type Skills = Partial<Record<Kind, SkillState>>

/**
 * Where a worker stands overall, which decides where the app sends them.
 *
 *   choose    no skills picked yet
 *   required  skills picked, none passed yet, at least one still to assess
 *   passed    at least one skill passed, so work can reach them
 *   failed    every skill they picked was failed
 */
export type Standing = 'choose' | 'required' | 'passed' | 'failed'

export function skillsIn(skills: Skills, state: SkillState): Kind[] {
  return SERVABLE_KINDS.filter((kind) => skills[kind] === state)
}

export function standing(skills: Skills): Standing {
  if (skillsIn(skills, 'passed').length > 0) return 'passed'
  if (skillsIn(skills, 'chosen').length > 0) return 'required'
  if (skillsIn(skills, 'failed').length > 0) return 'failed'
  return 'choose'
}

/** The next skill still waiting for its assessment, in catalogue order. */
export function nextToAssess(skills: Skills): Kind | undefined {
  return skillsIn(skills, 'chosen')[0]
}

/**
 * Skills for a worker saved before skills existed.
 *
 * They took one assessment across every kind, so the kinds they have graded
 * history in are the ones they showed they can do. A worker who failed that
 * assessment is closed on the same kinds; one with no history has chosen nothing.
 */
export function legacySkills(
  record: { byKind: Partial<Record<Kind, { agreements: number; disagreements: number } | undefined>> },
  failed: boolean,
): Skills {
  const skills: Skills = {}
  for (const kind of SERVABLE_KINDS) {
    const history = record.byKind[kind]
    if (history && history.agreements + history.disagreements > 0) skills[kind] = failed ? 'failed' : 'passed'
  }
  return skills
}
