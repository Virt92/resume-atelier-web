import {
  analyzeVacancy,
  atsAudit,
  baselineAtsAudit,
  extractResumeFacts,
  gapAssist,
  mapEvidence,
  refineRewrite,
  rewriteResume,
  selfCritique,
  translateAndPolish,
  type PipelineContext
} from './pipeline'
import { useSessionStore } from '../stores/session'

export async function runPipeline(): Promise<void> {
  const store = useSessionStore()
  if (!store.canRun) return

  store.resetPipeline()
  store.markStage('upload', 'done')
  store.markStage('parse', 'done')
  store.isRunning = true
  store.error = ''

  const ctx: PipelineContext = {
    apiKey: store.settings.falKey,
    model: store.settings.model,
    language: store.settings.language,
    mode: store.settings.mode,
    onProgress: (stage, status, detail) => {
      if (status === 'running') store.markStage(stage as never, 'running')
      else if (status === 'done') store.markStage(stage as never, 'done')
      else if (status === 'skipped') store.markStage(stage as never, 'skipped')
      else if (status === 'error') store.markStage(stage as never, 'error', detail)
    }
  }

  try {
    const [facts, vacancy] = await Promise.all([
      extractResumeFacts(ctx, store.resumeText),
      analyzeVacancy(ctx, store.vacancyText)
    ])
    store.facts = facts
    store.vacancy = vacancy

    const evidence = await mapEvidence(ctx, facts, vacancy)
    store.evidence = evidence

    // Baseline ATS: what does the ORIGINAL resume score against this vacancy,
    // before any rewrite/translation? Deterministic keyword scan + shared rubric.
    store.baselineAudit = baselineAtsAudit(
      store.resumeText,
      facts,
      vacancy,
      evidence
    )

    let rewritten = await rewriteResume(ctx, facts, vacancy, evidence)
    store.rewritten = rewritten

    // Self-critique + refine loop: a senior-recruiter pass that finds concrete
    // weaknesses, then a refine pass that applies those fixes. Both stages are
    // optional (controlled by settings.selfCritique; default ON). If either
    // LLM call fails we fall back to the original rewrite so the pipeline
    // always completes.
    const selfCritiqueEnabled = store.settings.selfCritique !== false
    if (selfCritiqueEnabled) {
      try {
        const critique = await selfCritique(ctx, rewritten, vacancy, evidence)
        store.critique = critique
        rewritten = await refineRewrite(
          ctx,
          rewritten,
          facts,
          vacancy,
          evidence,
          critique
        )
        store.rewritten = rewritten
      } catch {
        // non-fatal; keep the original rewrite and continue
      }
    } else {
      store.markStage('self_critique', 'skipped')
      store.markStage('refine_rewrite', 'skipped')
    }

    // Translate & polish: only when source language differs from target. This
    // runs a second LLM pass that translates every narrative field (not just
    // the latest role) and smooths grammar.
    let displayFacts = facts
    let displayRewritten = rewritten
    const needsTranslation =
      !!store.detectedLanguage &&
      store.detectedLanguage !== store.settings.language
    if (needsTranslation) {
      try {
        const polished = await translateAndPolish(ctx, facts, rewritten, vacancy, evidence)
        displayFacts = polished.facts
        displayRewritten = polished.rewritten
        store.localizedFacts = polished.facts
        store.rewritten = polished.rewritten
      } catch {
        // non-fatal: keep the partially-translated rewrite
      }
    } else {
      store.markStage('translate_polish', 'skipped')
    }

    const [audit, gap] = await Promise.all([
      atsAudit(ctx, displayRewritten, displayFacts, vacancy, evidence),
      gapAssist(ctx, evidence)
    ])
    store.audit = audit
    store.gap = gap
    store.isDone = true
    // reference displayFacts so it isn't optimized away in non-translation path
    void displayFacts
  } catch (e) {
    store.error = e instanceof Error ? e.message : String(e)
  } finally {
    store.isRunning = false
  }
}
