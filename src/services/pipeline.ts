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
  vacancy: VacancyAnalysis
): Promise<ATSAudit> {
  const raw = await runStage<Partial<ATSAudit>>(
    ctx,
    'ats_audit',
    atsAuditPrompt(rewritten, vacancy)
  )
  return {
    score: typeof raw.score === 'number' ? raw.score : 0,
    warnings: raw.warnings ?? [],
    keywordCoverage: raw.keywordCoverage ?? []
  }
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
