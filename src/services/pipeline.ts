import { callLlm, extractJson } from './falClient'
import {
  SYSTEM_PROMPT,
  analyzeVacancyPrompt,
  atsAuditPrompt,
  extractFactsPrompt,
  gapAssistPrompt,
  mapEvidencePrompt,
  rewritePrompt
} from './prompts'
import type {
  ATSAudit,
  ATSAuditBreakdown,
  EvidenceMap,
  GapAssist,
  Language,
  Mode,
  ResumeFacts,
  RewrittenResume,
  VacancyAnalysis
} from '../types'

export interface PipelineContext {
  apiKey: string
  model: string
  language: Language
  mode: Mode
  onProgress?: (stage: string, status: 'running' | 'done' | 'error', detail?: string) => void
}

async function runStage<T>(
  ctx: PipelineContext,
  stage: string,
  prompt: string
): Promise<T> {
  ctx.onProgress?.(stage, 'running')
  try {
    const res = await callLlm({
      apiKey: ctx.apiKey,
      model: ctx.model,
      systemPrompt: SYSTEM_PROMPT,
      prompt
    })
    const parsed = extractJson<T>(res.text)
    ctx.onProgress?.(stage, 'done')
    return parsed
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    ctx.onProgress?.(stage, 'error', msg)
    throw e
  }
}

export async function extractResumeFacts(
  ctx: PipelineContext,
  resumeText: string
): Promise<ResumeFacts> {
  const raw = await runStage<Partial<ResumeFacts>>(
    ctx,
    'extract_facts',
    extractFactsPrompt(resumeText)
  )
  return normalizeFacts(raw)
}

export async function analyzeVacancy(
  ctx: PipelineContext,
  vacancyText: string
): Promise<VacancyAnalysis> {
  const raw = await runStage<Partial<VacancyAnalysis>>(
    ctx,
    'analyze_vacancy',
    analyzeVacancyPrompt(vacancyText)
  )
  return {
    roleTitle: raw.roleTitle ?? '',
    seniority: raw.seniority,
    mustHave: raw.mustHave ?? [],
    preferred: raw.preferred ?? [],
    responsibilities: raw.responsibilities ?? [],
    tools: raw.tools ?? [],
    domainTerms: raw.domainTerms ?? [],
    yearsRequired: raw.yearsRequired,
    languageRequirements: raw.languageRequirements ?? [],
    knockoutSignals: raw.knockoutSignals ?? []
  }
}

export async function mapEvidence(
  ctx: PipelineContext,
  facts: ResumeFacts,
  vacancy: VacancyAnalysis
): Promise<EvidenceMap> {
  const raw = await runStage<Partial<EvidenceMap>>(
    ctx,
    'map_evidence',
    mapEvidencePrompt(facts, vacancy)
  )
  return {
    items: raw.items ?? [],
    rewriteAllowed: raw.rewriteAllowed ?? [],
    rewriteForbidden: raw.rewriteForbidden ?? [],
    focusSummary: raw.focusSummary ?? [],
    focusLatestRole: raw.focusLatestRole ?? [],
    focusSkills: raw.focusSkills ?? []
  }
}

export async function rewriteResume(
  ctx: PipelineContext,
  facts: ResumeFacts,
  vacancy: VacancyAnalysis,
  evidence: EvidenceMap
): Promise<RewrittenResume> {
  const raw = await runStage<Partial<RewrittenResume>>(
    ctx,
    'rewrite',
    rewritePrompt(facts, vacancy, evidence, ctx.language, ctx.mode)
  )
  return {
    summary: raw.summary ?? facts.summary ?? '',
    skills: raw.skills?.length ? raw.skills : facts.skills,
    latestRoleBullets:
      raw.latestRoleBullets?.length
        ? raw.latestRoleBullets
        : facts.experience[0]?.bullets ?? [],
    experience: raw.experience?.length ? raw.experience : facts.experience,
    changedSections: raw.changedSections ?? []
  }
}

export async function atsAudit(
  ctx: PipelineContext,
  rewritten: RewrittenResume,
  vacancy: VacancyAnalysis,
  evidence: EvidenceMap
): Promise<ATSAudit> {
  const raw = await runStage<Partial<ATSAudit>>(
    ctx,
    'ats_audit',
    atsAuditPrompt(rewritten, vacancy, evidence)
  )
  const reconciled = reconcileAtsScore(
    raw.breakdown,
    typeof raw.score === 'number' ? raw.score : undefined,
    vacancy,
    evidence
  )
  return {
    score: reconciled.score,
    warnings: raw.warnings ?? [],
    keywordCoverage: raw.keywordCoverage ?? [],
    breakdown: reconciled.breakdown
  }
}

/**
 * Deterministic post-process: recompute the score from the breakdown using the same rubric
 * declared in the prompt. We do NOT trust the LLM's self-reported number when the breakdown
 * disagrees with it (caps blind optimism).
 */
function reconcileAtsScore(
  breakdown: Partial<ATSAuditBreakdown> | undefined,
  llmScore: number | undefined,
  vacancy: VacancyAnalysis,
  evidence: EvidenceMap
): { score: number; breakdown: ATSAuditBreakdown } {
  const unsupportedItems = (evidence?.items ?? []).filter(
    (i) => i.support === 'unsupported'
  ).length

  const b: ATSAuditBreakdown = {
    mustHaveCovered: clampInt(
      breakdown?.mustHaveCovered ?? 0,
      0,
      vacancy.mustHave.length
    ),
    mustHaveTotal: vacancy.mustHave.length,
    toolsCovered: clampInt(breakdown?.toolsCovered ?? 0, 0, vacancy.tools.length),
    toolsTotal: vacancy.tools.length,
    languageRequirementsMet:
      typeof breakdown?.languageRequirementsMet === 'boolean'
        ? breakdown.languageRequirementsMet
        : vacancy.languageRequirements.length === 0,
    educationPresent:
      typeof breakdown?.educationPresent === 'boolean'
        ? breakdown.educationPresent
        : true,
    yearsMeetsOrExceeds:
      typeof breakdown?.yearsMeetsOrExceeds === 'boolean'
        ? breakdown.yearsMeetsOrExceeds
        : true,
    unsupportedCount: clampInt(
      breakdown?.unsupportedCount ?? unsupportedItems,
      0,
      Math.max(unsupportedItems, 0)
    ),
    penalties: breakdown?.penalties ?? []
  }

  let score = 100
  const penalties: string[] = []

  const missingMustHave = Math.max(0, b.mustHaveTotal - b.mustHaveCovered)
  if (missingMustHave > 0) {
    const p = missingMustHave * 8
    score -= p
    penalties.push(`-${p}: ${missingMustHave} must-have item(s) not evidenced`)
  }

  const missingTools = Math.max(0, b.toolsTotal - b.toolsCovered)
  if (missingTools > 0) {
    const p = missingTools * 3
    score -= p
    penalties.push(`-${p}: ${missingTools} tool(s) not mentioned`)
  }

  if (vacancy.languageRequirements.length && !b.languageRequirementsMet) {
    score -= 10
    penalties.push(`-10: language requirement not stated on resume`)
  }

  const vacancyMentionsEducation = /educat|degree|bachelor|master|diplom|унівёверс|ліц|ВНЗ|высш/i.test(
    vacancy.mustHave.concat(vacancy.preferred, vacancy.responsibilities).join(' ')
  )
  if (vacancyMentionsEducation && !b.educationPresent) {
    score -= 8
    penalties.push(`-8: education required but no education entries`)
  }

  if (vacancy.yearsRequired && !b.yearsMeetsOrExceeds) {
    score -= 5
    penalties.push(`-5: years of experience below requirement`)
  }

  const unsupPenalty = Math.min(b.unsupportedCount * 2, 15)
  if (unsupPenalty > 0) {
    score -= unsupPenalty
    penalties.push(
      `-${unsupPenalty}: ${b.unsupportedCount} unsupported requirement(s)`
    )
  }

  b.penalties = penalties
  score = Math.max(0, Math.min(100, Math.round(score)))

  // If the LLM reported a lower score (e.g. it spotted something we missed), respect that.
  if (typeof llmScore === 'number' && llmScore >= 0 && llmScore < score) {
    score = Math.round(llmScore)
  }

  return { score, breakdown: b }
}

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min
  return Math.max(min, Math.min(max, Math.round(v)))
}

export async function gapAssist(
  ctx: PipelineContext,
  evidence: EvidenceMap
): Promise<GapAssist> {
  const raw = await runStage<Partial<GapAssist>>(
    ctx,
    'gap_assist',
    gapAssistPrompt(evidence, ctx.language)
  )
  return {
    transferable: raw.transferable ?? [],
    safeToStrengthen: raw.safeToStrengthen ?? [],
    manualInputNeeded: raw.manualInputNeeded ?? []
  }
}

function normalizeFacts(raw: Partial<ResumeFacts>): ResumeFacts {
  return {
    name: raw.name ?? undefined,
    contacts: raw.contacts ?? [],
    summary: raw.summary ?? undefined,
    experience: (raw.experience ?? []).map((e) => ({
      company: e.company ?? '',
      role: e.role ?? '',
      start: e.start ?? '',
      end: e.end ?? '',
      location: e.location,
      bullets: e.bullets ?? []
    })),
    education: raw.education ?? [],
    skills: raw.skills ?? [],
    projects: raw.projects ?? [],
    certifications: raw.certifications ?? [],
    languages: raw.languages ?? [],
    inferredRole: raw.inferredRole,
    sourceLanguage: raw.sourceLanguage
  }
}
