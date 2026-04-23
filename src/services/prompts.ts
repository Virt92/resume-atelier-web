import type { Language, Mode } from '../types'

const languageName: Record<Language, string> = {
  English: 'English',
  Ukrainian: 'Ukrainian',
  Russian: 'Russian'
}

export const extractFactsPrompt = (resumeText: string) => `
You are a resume parser. Extract structured facts from the following resume. Return strict JSON.

Required shape:
{
  "name": string | null,
  "contacts": string[],           // emails, phones, URLs, city
  "summary": string | null,
  "experience": [
    { "company": string, "role": string, "start": string, "end": string, "location": string | null, "bullets": string[] }
  ],
  "education": [
    { "institution": string, "degree": string, "start": string | null, "end": string | null, "details": string | null }
  ],
  "skills": string[],
  "projects": [{ "title": string, "description": string }],
  "certifications": string[],
  "languages": string[],
  "inferredRole": string | null
}

Rules:
- Do NOT invent facts that are not in the source text.
- Preserve original wording in bullets; just split them into an array.
- "start"/"end" may be strings like "2021", "Jan 2022", "Present".

Resume text:
"""
${resumeText}
"""
`.trim()

export const analyzeVacancyPrompt = (vacancyText: string) => `
You analyze job vacancies. Return strict JSON in this shape:

{
  "roleTitle": string,
  "seniority": string | null,
  "mustHave": string[],
  "preferred": string[],
  "responsibilities": string[],
  "tools": string[],
  "domainTerms": string[],
  "yearsRequired": string | null,
  "languageRequirements": string[],
  "knockoutSignals": string[]
}

Rules:
- Be concise; each array item is a short phrase.
- "knockoutSignals" = hard blockers (e.g. "clearance required", "EU work permit").

Vacancy text:
"""
${vacancyText}
"""
`.trim()

export const mapEvidencePrompt = (
  facts: unknown,
  vacancy: unknown
) => `
You map vacancy requirements to resume evidence. Return strict JSON:

{
  "items": [
    { "requirement": string, "support": "direct" | "indirect" | "unsupported", "evidence": string | null, "note": string | null }
  ],
  "rewriteAllowed": string[],      // sections or bullet indices that can be rewritten
  "rewriteForbidden": string[],    // things we must not touch (dates, companies, degrees)
  "focusSummary": string[],        // key terms the new summary should reflect
  "focusLatestRole": string[],     // key terms for latest role bullets
  "focusSkills": string[]          // key skills to uplift if supported
}

Rules:
- "direct" = requirement clearly matched by explicit evidence in resume.
- "indirect" = transferable / adjacent experience that can be framed toward this requirement.
- "unsupported" = NO evidence — do not try to cover with new claims.
- Never output new experience beyond the resume.

Resume facts JSON:
${JSON.stringify(facts)}

Vacancy analysis JSON:
${JSON.stringify(vacancy)}
`.trim()

export const rewritePrompt = (
  facts: unknown,
  vacancy: unknown,
  evidence: unknown,
  language: Language,
  mode: Mode
) => {
  const modeHint: Record<Mode, string> = {
    standard: 'Balanced adaptation: uplift wording, keep tone, preserve truth.',
    safe: 'Conservative: only rewrite with "direct" or strong "indirect" support. Minimal risk.',
    aggressive:
      'Stronger wording on latest role and summary, but still only using supported evidence.',
    adapt_safely:
      'Large mismatch: focus on transferable skills honestly; do NOT pretend to have missing domain experience.'
  }

  return `
You rewrite selected resume sections to better match a vacancy.

Output strict JSON:
{
  "summary": string,
  "skills": string[],
  "latestRoleBullets": string[],
  "experience": [
    { "company": string, "role": string, "start": string, "end": string, "location": string | null, "bullets": string[] }
  ],
  "changedSections": [
    { "section": "summary" | "skills" | "latestRoleBullets" | string, "before": string, "after": string }
  ]
}

Constraints:
- Target language: ${languageName[language]}. Translate content if source differs.
- Mode: ${modeHint[mode]}
- NEVER invent companies, tools, certifications, years, domains, or portfolio.
- NEVER copy the vacancy text verbatim. Use natural phrasing.
- Preserve all dates, company names, role titles, and degrees exactly.
- Use ATS-friendly terminology drawn from the vacancy where it is truthfully supported.
- "latestRoleBullets" is the rewritten bullet list for the FIRST experience entry.
- "experience" must contain the SAME entries as input, in the SAME order; only bullets of the first entry may differ (use latestRoleBullets). Leave other bullets unchanged.
- Only rewrite skills you can justify from evidence; do not add unsupported ones.

Resume facts JSON:
${JSON.stringify(facts)}

Vacancy analysis JSON:
${JSON.stringify(vacancy)}

Evidence map JSON:
${JSON.stringify(evidence)}
`.trim()
}

export const atsAuditPrompt = (
  rewritten: unknown,
  vacancy: unknown
) => `
You audit the adapted resume for ATS friendliness and keyword coverage.

Output strict JSON:
{
  "score": number,                 // 0..100
  "warnings": string[],            // e.g. "Missing quantified results", "Acronyms not expanded"
  "keywordCoverage": [
    { "keyword": string, "present": boolean }
  ]
}

Use the vacancy's mustHave + tools as keyword source.

Rewritten resume JSON:
${JSON.stringify(rewritten)}

Vacancy analysis JSON:
${JSON.stringify(vacancy)}
`.trim()

export const gapAssistPrompt = (
  evidence: unknown,
  language: Language
) => `
You produce an honest gap-assist guide for the candidate.

Output strict JSON:
{
  "transferable": string[],         // Strengths from resume that transfer to this vacancy
  "safeToStrengthen": string[],     // Existing items the candidate can honestly emphasize more
  "manualInputNeeded": string[]     // Items the user should add themselves IF real (never claim on their behalf)
}

Language: ${languageName[language]}. Keep each item under 160 chars.

Evidence map JSON:
${JSON.stringify(evidence)}
`.trim()

export const SYSTEM_PROMPT =
  'You are an ATS-aware resume adaptation assistant. You follow instructions precisely and respond with strict JSON when asked. You never invent facts about the candidate.'
