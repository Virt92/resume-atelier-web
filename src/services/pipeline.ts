import { callLlm, extractJson } from './falClient'
import {
  SYSTEM_PROMPT,
  analyzeVacancyPrompt,
  atsAuditPrompt,
  extractFactsPrompt,
  gapAssistPrompt,
  mapEvidencePrompt,
  rewritePrompt,
  translatePolishPrompt
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
  prompt: string,
  opts?: { temperature?: number }
): Promise<T> {
  ctx.onProgress?.(stage, 'running')
  try {
    const res = await callLlm({
      apiKey: ctx.apiKey,
      model: ctx.model,
      systemPrompt: SYSTEM_PROMPT,
      prompt,
      temperature: opts?.temperature
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
  const { supportedKeywords, supportedTools } = computeSupportedKeywords(
    vacancy,
    evidence
  )
  const raw = await runStage<Partial<RewrittenResume>>(
    ctx,
    'rewrite',
    rewritePrompt(
      facts,
      vacancy,
      evidence,
      ctx.language,
      ctx.mode,
      supportedKeywords,
      supportedTools
    )
  )
  // Always build skills as sanitize(raw.skills ∪ facts.skills ∪ supportedTools).
  // This guarantees tool coverage regardless of what the LLM chose to emit.
  const unionSkills: string[] = [
    ...(raw.skills ?? []),
    ...(facts.skills ?? []),
    ...supportedTools
  ]
  let skills = sanitizeSkills(unionSkills)
  // If sanitize stripped everything, at least keep supportedTools (tools list
  // contains no role titles by construction).
  if (skills.length === 0) skills = sanitizeSkills(supportedTools)

  let summary = raw.summary ?? facts.summary ?? ''
  if (wordCount(summary) < 60) {
    summary = await expandSummary(
      ctx,
      facts,
      vacancy,
      supportedKeywords,
      supportedTools,
      summary
    )
  }

  return {
    summary,
    skills,
    latestRoleBullets:
      raw.latestRoleBullets?.length
        ? raw.latestRoleBullets
        : facts.experience[0]?.bullets ?? [],
    experience: raw.experience?.length ? raw.experience : facts.experience,
    changedSections: raw.changedSections ?? []
  }
}

export async function translateAndPolish(
  ctx: PipelineContext,
  facts: ResumeFacts,
  rewritten: RewrittenResume,
  vacancy: VacancyAnalysis,
  evidence: EvidenceMap
): Promise<{ facts: ResumeFacts; rewritten: RewrittenResume }> {
  const raw = await runStage<{
    facts?: Partial<ResumeFacts>
    rewritten?: Partial<RewrittenResume>
  }>(
    ctx,
    'translate_polish',
    translatePolishPrompt(facts, rewritten, ctx.language)
  )
  const nextFacts: ResumeFacts = {
    name: raw.facts?.name ?? facts.name,
    contacts: raw.facts?.contacts?.length ? raw.facts.contacts : facts.contacts,
    summary: raw.facts?.summary ?? facts.summary,
    experience: raw.facts?.experience?.length
      ? raw.facts.experience.map((e, i) => ({
          company: e.company || facts.experience[i]?.company || '',
          role: e.role || facts.experience[i]?.role || '',
          start: e.start || facts.experience[i]?.start || '',
          end: e.end || facts.experience[i]?.end || '',
          location: e.location ?? facts.experience[i]?.location,
          bullets: e.bullets?.length ? e.bullets : facts.experience[i]?.bullets ?? []
        }))
      : facts.experience,
    education: raw.facts?.education?.length ? raw.facts.education : facts.education,
    skills: sanitizeSkills(raw.facts?.skills?.length ? raw.facts.skills : facts.skills),
    projects: raw.facts?.projects?.length ? raw.facts.projects : facts.projects,
    certifications: raw.facts?.certifications?.length
      ? raw.facts.certifications
      : facts.certifications,
    languages: raw.facts?.languages?.length ? raw.facts.languages : facts.languages,
    inferredRole: raw.facts?.inferredRole ?? facts.inferredRole,
    sourceLanguage: facts.sourceLanguage
  }
  // Skills: prefer the LLM-translated list. Unioning with the pre-translation
  // list here is what caused UA+EN duplicates ("UX/UI дизайн" + "UX/UI design"
  // as separate pills). Only fall back to the pre-translation list if the LLM
  // dropped it entirely.
  const translatedSkills = raw.rewritten?.skills?.length
    ? raw.rewritten.skills
    : rewritten.skills
  const nextRewritten: RewrittenResume = {
    summary: raw.rewritten?.summary ?? rewritten.summary,
    skills: sanitizeSkills(translatedSkills),
    latestRoleBullets: raw.rewritten?.latestRoleBullets?.length
      ? raw.rewritten.latestRoleBullets
      : rewritten.latestRoleBullets,
    experience: raw.rewritten?.experience?.length
      ? raw.rewritten.experience.map((e, i) => ({
          company: e.company || rewritten.experience[i]?.company || '',
          role: e.role || rewritten.experience[i]?.role || '',
          start: e.start || rewritten.experience[i]?.start || '',
          end: e.end || rewritten.experience[i]?.end || '',
          location: e.location ?? rewritten.experience[i]?.location,
          bullets: e.bullets?.length
            ? e.bullets
            : rewritten.experience[i]?.bullets ?? []
        }))
      : rewritten.experience,
    changedSections: rewritten.changedSections
  }
  // Second pass: if target is a Cyrillic language and some bullets still read
  // as English, translate just those residuals. Keeps everything else intact.
  const bulletsPolished = await translateResidualBullets(
    ctx,
    nextRewritten,
    ctx.language
  )
  // Third pass: same idea for the skills array. This guarantees we do not ship
  // a mixed-language pill list like "UX/UI дизайн" + "UX/UI design" side by
  // side. Proper nouns (Figma, Jira, Ant Design) are preserved by the LLM.
  const skillsPolished = await translateResidualSkills(
    ctx,
    bulletsPolished,
    ctx.language
  )
  // Final belt-and-suspenders sanitize: the LLM can still slip role titles
  // ("Brand Designer", "SMM-manager") into translated skills. Re-run the
  // rejection filter on the final list.
  const finalSkills = sanitizeSkills(skillsPolished.skills)
  // Fourth pass: if summary came back too short (2-3 sentences) from the
  // translate_polish LLM, re-expand it. translate_polish sometimes condenses
  // below our 4-5 sentence target.
  let finalSummary = skillsPolished.summary
  if (wordCount(finalSummary) < 60 || sentenceCount(finalSummary) < 4) {
    try {
      const { supportedKeywords, supportedTools } = computeSupportedKeywords(
        vacancy,
        evidence
      )
      finalSummary = await expandSummary(
        ctx,
        nextFacts,
        vacancy,
        supportedKeywords,
        supportedTools,
        finalSummary
      )
    } catch {
      // non-fatal
    }
  }
  return {
    facts: nextFacts,
    rewritten: { ...skillsPolished, skills: finalSkills, summary: finalSummary }
  }
}

function sentenceCount(s: string | undefined | null): number {
  if (!s) return 0
  return s.split(/[.!?]+\s+/).filter((p) => p.trim().length > 0).length
}

function wordCount(s: string | undefined | null): number {
  if (!s) return 0
  return s.trim().split(/\s+/).filter(Boolean).length
}

function hasCyrillic(s: string): boolean {
  return /[\u0400-\u04FF]/.test(s)
}

function looksLikeEnglish(s: string): boolean {
  // At least 3 English words in a row, and no Cyrillic anywhere.
  if (hasCyrillic(s)) return false
  return /[A-Za-z]{2,}(?:[\s\-,.:;/][A-Za-z]{2,}){2,}/.test(s)
}

async function expandSummary(
  ctx: PipelineContext,
  facts: ResumeFacts,
  vacancy: VacancyAnalysis,
  supportedKeywords: string[],
  supportedTools: string[],
  currentSummary: string
): Promise<string> {
  try {
    const prompt = `
Rewrite the candidate's resume SUMMARY to 4-5 sentences, 60-110 words total, in ${ctx.language}.

HARD RULES:
- Base every claim on the provided facts. Never invent experience, tools, years, or domains not in facts.
- Weave in as many of these supported vacancy keywords as naturally fit: ${supportedKeywords.slice(0, 10).join(', ')}.
- Mention supported tools/methodologies: ${supportedTools.slice(0, 8).join(', ')}.
- Keep proper names / tool names (Figma, Jira, etc.) in original form.
- Output ONLY the rewritten summary as a single string, no JSON, no quotes, no preamble.

Candidate facts JSON:
${JSON.stringify({ name: facts.name, summary: facts.summary, inferredRole: facts.inferredRole, experience: facts.experience.slice(0, 3), skills: facts.skills })}

Target role: ${vacancy.roleTitle}${vacancy.seniority ? ' / ' + vacancy.seniority : ''}

Current (too short) summary:
${currentSummary}
`.trim()
    const res = await callLlm({
      apiKey: ctx.apiKey,
      model: ctx.model,
      systemPrompt: SYSTEM_PROMPT,
      prompt
    })
    const text = res.text.trim().replace(/^["']|["']$/g, '')
    if (wordCount(text) >= 50) return text
  } catch {
    // non-fatal; keep the original short summary
  }
  return currentSummary
}

async function translateResidualBullets(
  ctx: PipelineContext,
  rewritten: RewrittenResume,
  target: Language
): Promise<RewrittenResume> {
  const cyrTarget = target === 'Ukrainian' || target === 'Russian'
  if (!cyrTarget) return rewritten
  // Collect all English-looking strings we need to translate.
  const collectJobs: Array<{ path: string; value: string }> = []
  rewritten.experience.forEach((role, ri) => {
    role.bullets.forEach((b, bi) => {
      if (looksLikeEnglish(b)) collectJobs.push({ path: `e${ri}.b${bi}`, value: b })
    })
  })
  rewritten.latestRoleBullets.forEach((b, bi) => {
    if (looksLikeEnglish(b)) collectJobs.push({ path: `latest.${bi}`, value: b })
  })
  if (looksLikeEnglish(rewritten.summary)) {
    collectJobs.push({ path: 'summary', value: rewritten.summary })
  }
  if (collectJobs.length === 0) return rewritten
  try {
    const prompt = `
Translate each of the following strings into ${target}. Keep brand / tool names (Figma, Jira, HTML/CSS, Ant Design, etc.) in the original form, but every other word MUST be in ${target}. Every output must contain at least one ${target} word. Return strict JSON: { "translations": string[] } preserving input order, same length (exactly ${collectJobs.length} items).

Inputs:
${JSON.stringify(collectJobs.map((j) => j.value))}
`.trim()
    const res = await callLlm({
      apiKey: ctx.apiKey,
      model: ctx.model,
      systemPrompt: SYSTEM_PROMPT,
      prompt,
      temperature: 0
    })
    const parsed = extractJson<{ translations?: string[] }>(res.text)
    const out = parsed.translations ?? []
    // If array length mismatches, apply what we have (partial is better than
    // giving up and keeping all bullets in English).
    if (out.length === 0) return rewritten
    const experience = rewritten.experience.map((role) => ({
      ...role,
      bullets: [...role.bullets]
    }))
    const latestBullets = [...rewritten.latestRoleBullets]
    let summary = rewritten.summary
    collectJobs.forEach((job, idx) => {
      const translated = (out[idx] ?? '').trim()
      if (!translated || !hasCyrillic(translated)) return
      if (job.path === 'summary') {
        summary = translated
      } else if (job.path.startsWith('latest.')) {
        const bi = Number(job.path.split('.')[1])
        if (Number.isFinite(bi)) latestBullets[bi] = translated
      } else {
        const m = /^e(\d+)\.b(\d+)$/.exec(job.path)
        if (m) {
          const ri = Number(m[1])
          const bi = Number(m[2])
          if (experience[ri]?.bullets?.[bi] !== undefined) {
            experience[ri].bullets[bi] = translated
          }
        }
      }
    })
    return {
      ...rewritten,
      summary,
      latestRoleBullets: latestBullets,
      experience
    }
  } catch {
    return rewritten
  }
}

/**
 * Known proper-noun tools that should stay in original form even when the rest
 * of the resume is in Ukrainian/Russian. These also count as "already fine" so
 * we don't waste tokens trying to translate them.
 */
const PROPER_NOUN_SKILLS = new Set(
  [
    'figma',
    'jira',
    'sketch',
    'adobe xd',
    'photoshop',
    'illustrator',
    'webflow',
    'notion',
    'miro',
    'zeplin',
    'ant design',
    'bootstrap',
    'material ui',
    'html/css',
    'html',
    'css',
    'javascript',
    'typescript',
    'react',
    'vue',
    'canva',
    'asana',
    'slack',
    'trello',
    'github',
    'gitlab',
    'spline',
    'framer'
  ].map((s) => s.toLowerCase())
)

async function translateResidualSkills(
  ctx: PipelineContext,
  rewritten: RewrittenResume,
  target: Language
): Promise<RewrittenResume> {
  const cyrTarget = target === 'Ukrainian' || target === 'Russian'
  if (!cyrTarget) return rewritten
  // Index skills that still look English and are NOT proper-noun tools.
  const jobs: Array<{ idx: number; value: string }> = []
  rewritten.skills.forEach((s, idx) => {
    const lower = s.trim().toLowerCase()
    if (!lower) return
    if (PROPER_NOUN_SKILLS.has(lower)) return
    if (hasCyrillic(s)) return
    // Short all-caps / mixed-case single tokens (e.g. "SMM", "UX") we keep.
    if (/^[A-Z/&\- 0-9.]{2,6}$/.test(s.trim())) return
    jobs.push({ idx, value: s })
  })
  if (jobs.length === 0) {
    // Still dedupe in case LLM produced same-language duplicates.
    return { ...rewritten, skills: dedupeSkills(rewritten.skills) }
  }
  try {
    const prompt = `
Translate each of the following resume skills into ${target}. Keep brand or tool names (Figma, Jira, Ant Design, HTML/CSS, Adobe XD, Webflow, etc.) exactly as-is. For descriptive skills (e.g. "responsive design", "user research", "design systems") translate to ${target}. Return strict JSON: { "translations": string[] } preserving input order, same length. Each translation should be 1-4 words.

Inputs:
${JSON.stringify(jobs.map((j) => j.value))}
`.trim()
    const res = await callLlm({
      apiKey: ctx.apiKey,
      model: ctx.model,
      systemPrompt: SYSTEM_PROMPT,
      prompt,
      temperature: 0
    })
    const parsed = extractJson<{ translations?: string[] }>(res.text)
    const out = parsed.translations ?? []
    if (out.length !== jobs.length) {
      return { ...rewritten, skills: dedupeSkills(rewritten.skills) }
    }
    const next = [...rewritten.skills]
    jobs.forEach((job, i) => {
      const t = (out[i] ?? '').trim()
      if (!t) return
      next[job.idx] = t
    })
    return { ...rewritten, skills: dedupeSkills(next) }
  } catch {
    return { ...rewritten, skills: dedupeSkills(rewritten.skills) }
  }
}

/**
 * Casefold + fuzzy dedup for the skills array. Collapses things like
 * "responsive design" / "Responsive Design" / "RESPONSIVE DESIGN" to one entry,
 * and also collapses "ui kits" + "UI Kits". We stop short of cross-language
 * alias collapsing — that's what translateResidualSkills handles.
 */
function dedupeSkills(skills: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of skills) {
    const s = String(raw || '').trim()
    if (!s) continue
    const key = s.toLowerCase().replace(/[\s\-_/]+/g, ' ').trim()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
  }
  return out
}

/**
 * Deterministic baseline ATS audit on the ORIGINAL resume (no LLM). We scan the
 * raw resume text for vacancy keywords and reuse the same scoring rubric used
 * for the adapted resume. This is what the user's resume would score *before*
 * we touched it.
 */
export function baselineAtsAudit(
  resumeText: string,
  facts: ResumeFacts,
  vacancy: VacancyAnalysis,
  evidence: EvidenceMap
): ATSAudit {
  const hay = resumeText.toLowerCase()
  const contains = (phrase: string): boolean => {
    const p = phrase.trim().toLowerCase()
    if (!p) return false
    // match whole-word-ish; for short tokens rely on substring
    if (p.length <= 3) return hay.includes(p)
    return hay.includes(p)
  }

  const mustHaveCovered = vacancy.mustHave.filter(contains).length
  const toolsCovered = vacancy.tools.filter(contains).length

  const languageRequirementsMet =
    vacancy.languageRequirements.length === 0 ||
    vacancy.languageRequirements.some((req) => contains(req))

  const educationPresent = facts.education.length > 0

  const unsupportedCount = (evidence.items ?? []).filter(
    (i) => i.support === 'unsupported'
  ).length

  const keywords = Array.from(
    new Set([...vacancy.mustHave, ...vacancy.tools])
  ).slice(0, 30)
  const keywordCoverage = keywords.map((keyword) => ({
    keyword,
    present: contains(keyword)
  }))

  const reconciled = reconcileAtsScore(
    {
      mustHaveCovered,
      mustHaveTotal: vacancy.mustHave.length,
      toolsCovered,
      toolsTotal: vacancy.tools.length,
      languageRequirementsMet,
      educationPresent,
      yearsMeetsOrExceeds: true,
      unsupportedCount,
      penalties: []
    },
    undefined,
    vacancy,
    evidence
  )
  return {
    score: reconciled.score,
    warnings: [],
    keywordCoverage,
    breakdown: reconciled.breakdown
  }
}

export async function atsAudit(
  ctx: PipelineContext,
  rewritten: RewrittenResume,
  vacancy: VacancyAnalysis,
  evidence: EvidenceMap
): Promise<ATSAudit> {
  // temperature=0: ATS audit is a counting task, not a creative task. We want
  // the same input to produce the same breakdown every run so users don't see
  // the score flicker between sessions.
  const raw = await runStage<Partial<ATSAudit>>(
    ctx,
    'ats_audit',
    atsAuditPrompt(rewritten, vacancy, evidence),
    { temperature: 0 }
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

/**
 * Build a keyword coverage brief for the rewrite prompt. We turn the evidence
 * map + vacancy into two lists:
 *   - supportedKeywords: vacancy.mustHave + preferred + responsibilities that
 *     have "direct" or "indirect" support in the evidence map. Those are safe
 *     to mention verbatim — including them is ATS matching, not fabrication.
 *   - supportedTools: vacancy.tools / domainTerms that are NOT flagged
 *     "unsupported" by the evidence map. If a tool is not in the evidence
 *     map at all, we assume it is at best adjacent and leave the LLM to
 *     decide — we do NOT pre-include it to avoid fabricated claims.
 */
function computeSupportedKeywords(
  vacancy: VacancyAnalysis,
  evidence: EvidenceMap
): { supportedKeywords: string[]; supportedTools: string[] } {
  const byReq = new Map<string, string>()
  for (const item of evidence.items ?? []) {
    const key = item.requirement.trim().toLowerCase()
    if (!key) continue
    byReq.set(key, item.support)
  }

  const isSupported = (phrase: string): boolean => {
    const key = phrase.trim().toLowerCase()
    const sup = byReq.get(key)
    // Only include when we have explicit direct/indirect support.
    return sup === 'direct' || sup === 'indirect'
  }

  const dedupe = (arr: string[]): string[] => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const v of arr) {
      const k = v.trim().toLowerCase()
      if (!k || seen.has(k)) continue
      seen.add(k)
      out.push(v.trim())
    }
    return out
  }

  const supportedKeywords = dedupe([
    ...vacancy.mustHave.filter(isSupported),
    ...vacancy.preferred.filter(isSupported),
    ...vacancy.responsibilities.filter(isSupported),
    ...evidence.focusSummary,
    ...evidence.focusLatestRole
  ])

  const supportedTools = dedupe([
    ...vacancy.tools.filter(isSupported),
    ...vacancy.domainTerms.filter(isSupported),
    ...evidence.focusSkills
  ])

  return { supportedKeywords, supportedTools }
}

/**
 * Phrases that are job titles — never belong in the skills array.
 */
// Reject strings that are clearly job/role titles (suffix noun). These never
// belong in a skills array even when the LLM confuses them with skills.
const ROLE_TITLE_PATTERNS: RegExp[] = [
  /\bdesigner\b/i,
  /\bdesigners\b/i,
  /\bdeveloper\b/i,
  /\bdevelopers\b/i,
  /\bengineer\b/i,
  /\bengineers\b/i,
  /\barchitect\b/i,
  /\banalyst\b/i,
  /\bspecialist\b/i,
  /\bconsultant\b/i,
  /\bmanager\b/i,
  /\bmanagers\b/i,
  /\bowner\b/i,
  /\blead\b/i,
  /scrum master/i,
  /smm[- ]?(менеджер|manager)/i,
  /дизайнер/i,
  /розробник/i,
  /менеджер/i,
  // Role-title compounds like "Brand Designer", "SMM-manager",
  // "Graphic Designer", "Graphic Design" (skill collision) — the last word is
  // a role noun. Treat any two-word phrase ending in a role noun as a title.
  /\b(brand|graphic|product|visual|motion|web|ui|ux|ui\/ux|art|lead|senior|junior|middle)\s+(design|designer|manager|lead)\b/i
]

export function sanitizeSkills(skills: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of skills ?? []) {
    const s = String(raw || '').trim()
    if (!s) continue
    // Drop obvious role/job titles.
    if (ROLE_TITLE_PATTERNS.some((re) => re.test(s))) continue
    const key = s.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
  }
  return out
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
    // Sanitize right at extraction time so role-title-like items the LLM/OCR
    // lifted out of the resume (e.g. "Brand Designer", "SMM-manager") never
    // leak into the "before" side of the diff view or into the localized
    // facts used by the downloaded DOCX.
    skills: sanitizeSkills(raw.skills ?? []),
    projects: raw.projects ?? [],
    certifications: raw.certifications ?? [],
    languages: raw.languages ?? [],
    inferredRole: raw.inferredRole,
    sourceLanguage: raw.sourceLanguage
  }
}
