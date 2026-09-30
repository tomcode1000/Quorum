import type { AnswerSchema } from '@quorum/core'
import type { Assignment, Router } from '@quorum/gateway'
import { checkForPrompt } from './chain.js'

/**
 * A stand-in worker, for running the demo unattended.
 *
 * This exists so the comparison can be run in CI and on a laptop with no second
 * device, and it is labelled clearly wherever its output appears. It is not evidence
 * that anybody will do this work: the only thing that can establish that is real
 * people answering real questions on real phones, which is a recruiting problem
 * rather than an engineering one and is the actual risk in this project.
 *
 * What the simulation does model honestly is the thing that matters to the
 * arithmetic: a person takes several seconds to look, and a person is sometimes
 * wrong. Setting `accuracy` below 1 is how the escalation ladder gets exercised —
 * with a perfect simulated pool, a disagreement never happens and the redundancy
 * logic never runs.
 */

export type SimOptions = {
  workerId: string
  /** The prompt of the live question an assignment belongs to; assignments do not carry it. */
  promptFor: (questionId: string) => string
  /** Probability this worker answers correctly. */
  accuracy?: number
  /** How long they take to look, in milliseconds. */
  thinkMs?: number
  /** What they report about their own certainty. */
  selfConfidence?: number
  random?: () => number
}

export function startSimulatedWorker(router: Router, options: SimOptions): () => void {
  const { workerId, promptFor, accuracy = 1, thinkMs = 2_600, selfConfidence = 0.9, random = Math.random } = options
  const controller = new AbortController()

  void (async () => {
    while (!controller.signal.aborted) {
      const assignment = await router.takeAssignment(workerId, 1_000)
      if (controller.signal.aborted) return
      if (!assignment) continue

      // Reading time is not decoration. Answering faster than a question can be read
      // is one of the abuse signals, so a simulated worker that answered instantly
      // would be flagged by the system it is meant to be demonstrating.
      await sleep(thinkMs)
      if (controller.signal.aborted) return

      const correct = random() < accuracy
      const value = answerFor(assignment, promptFor(assignment.questionId), correct)
      router.submitAnswer({ assignmentId: assignment.assignmentId, workerId, value, selfConfidence })
    }
  })()

  return () => controller.abort()
}

/**
 * What this worker taps.
 *
 * A golden question is answered on its own terms, because the worker cannot tell it
 * apart from real work — which is the entire reason golden questions are worth
 * seeding.
 */
function answerFor(assignment: Assignment, prompt: string, correct: boolean): boolean | number | string {
  if (assignment.golden) {
    const { truth, schema } = assignment.golden
    return correct ? truth : someOtherAnswer(schema, truth)
  }
  const check = checkForPrompt(prompt)
  if (!check) throw new Error(`the simulated worker was shown a question the demo did not ask: ${prompt}`)
  // A wrong answer is the agent's own guess: the mistake a careless look would make.
  return correct ? check.truth : check.guess
}

/** A valid answer that is not the right one, so a wrong answer is still a legal one. */
function someOtherAnswer(schema: AnswerSchema, truth: boolean | number | string): boolean | number | string {
  switch (schema.kind) {
    case 'boolean':
      return truth !== true
    case 'choice':
      return schema.options.find((option) => option !== truth) ?? schema.options[0] ?? ''
    case 'number':
      return Number(truth) * 10
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
