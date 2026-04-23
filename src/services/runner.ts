import {
  analyzeVacancy,
  atsAudit,
  extractResumeFacts,
  gapAssist,
  mapEvidence,
  rewriteResume,
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

    const rewritten = await rewriteResume(ctx, facts, vacancy, evidence)
    store.rewritten = rewritten

    const [audit, gap] = await Promise.all([
      atsAudit(ctx, rewritten, vacancy, evidence),
      gapAssist(ctx, evidence)
    ])
    store.audit = audit
    store.gap = gap
    store.isDone = true
  } catch (e) {
    store.error = e instanceof Error ? e.message : String(e)
  } finally {
    store.isRunning = false
  }
}
