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
- "indirect" = transferable / adjacent experience that can be framed toward this requirement. Be generous here — if the candidate has ANY related activity (e.g. vacancy wants "design system experience" and resume mentions "UI kits, visual identity guidelines" → that's indirect).
- "unsupported" = truly NO hint of this in the resume. Use sparingly.
- For every indirect or direct item, evidence must quote or paraphrase a concrete fact from the resume. If you cannot, downgrade to unsupported.
- rewriteAllowed should include: "summary", "skills", and "experience[N].bullets" for each role N. The candidate wants the whole resume sharpened, not just the latest role.
- focusSummary / focusLatestRole / focusSkills should each contain at least 3 items drawn from vacancy.mustHave/tools/responsibilities that have direct or indirect support.
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
You rewrite selected resume sections to better match a vacancy — honestly.

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

Hard constraints:
- Target language: ${languageName[language]}. Translate content if source differs.
- Mode: ${modeHint[mode]}
- NEVER invent companies, tools, certifications, years, domains, or portfolio links that aren't in the source facts.
- NEVER copy vacancy sentences verbatim. Paraphrase naturally.
- PRESERVE all dates, company names, role titles (except the latest role title may be slightly harmonised to match the vacancy title IF actual duties already match), and degrees exactly.
- "experience" must contain the SAME entries in the SAME order.
- "latestRoleBullets" is the rewritten bullet list for the FIRST experience entry; mirror it into experience[0].bullets.
- Leave bullets of non-latest roles unchanged (same text, just translated if needed).

Integration playbook (the goal of the rewrite):
1. Summary: 3-4 sentences, 40-80 words. Start from the candidate's actual role + seniority and weave in vacancy RESPONSIBILITIES and TOOLS that have "direct" or "indirect" support in the evidence map. Do NOT mention anything marked "unsupported".
2. Skills: keep the ORIGINAL skills from facts.skills as a base (technologies, tools, methodologies — NOT role titles). Add vacancy tools/domain terms whose evidence is "direct" or "indirect". Never output role names (e.g. "Brand Designer") in the skills array.
3. Latest role bullets: 6-9 bullets. Each bullet MUST be grounded in a real fact from experience[0].bullets. For every evidence item marked "direct" or "indirect", make sure its vacancy terminology appears naturally in at least one bullet (or the summary, or skills). Honest example: if evidence says "prototyping present but not with Figma", you may write "Built high-fidelity prototypes and wireframes" — but never add "in Figma".
4. Unsupported requirements stay out of the resume entirely — they belong to Gap Assist.

Before returning, re-read every claim: if it is not traceable to facts, soften or delete it.

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
  vacancy: unknown,
  evidence: unknown
) => `
You are a STRICT ATS auditor. Be honest, not generous.

Output strict JSON:
{
  "score": number,                   // integer 0..100, computed by the rubric below
  "breakdown": {
    "mustHaveCovered": number,       // count of vacancy.mustHave items directly evidenced by rewritten resume
    "mustHaveTotal": number,         // = vacancy.mustHave.length
    "toolsCovered": number,          // count of vacancy.tools present as a keyword in rewritten resume
    "toolsTotal": number,            // = vacancy.tools.length
    "languageRequirementsMet": boolean,
    "educationPresent": boolean,
    "yearsMeetsOrExceeds": boolean,  // resume experience covers vacancy.yearsRequired (null => true)
    "unsupportedCount": number,      // count of evidence.items with support="unsupported"
    "penalties": string[]            // short reasons the score lost points
  },
  "warnings": string[],              // ATS problems (e.g. "English level not stated", "Education section empty")
  "keywordCoverage": [
    { "keyword": string, "present": boolean }
  ]
}

SCORING RUBRIC (apply exactly, no rounding up):
- Start from 100.
- Subtract **8 points** for every vacancy.mustHave item NOT directly evidenced in the rewritten resume.
- Subtract **3 points** for every vacancy.tools item not mentioned as a keyword.
- Subtract **10 points** if vacancy.languageRequirements are non-empty AND the resume does not state the required level (e.g. "English — Advanced").
- Subtract **8 points** if vacancy explicitly requires formal education AND the resume has no education entries.
- Subtract **5 points** if vacancy.yearsRequired is stated and the resume's total experience falls short.
- Subtract **2 points** per evidence.items entry with support="unsupported", up to a total of 15 points.
- Subtract **5 points** if summary has fewer than 30 words.
- Floor at 0. Never exceed 100.
- Do NOT reward adding irrelevant keywords, padding, or repeated words.

Be conservative when you can't verify a match: treat ambiguous matches as NOT covered.

Populate keywordCoverage with the UNION of vacancy.mustHave + vacancy.tools (deduplicated, max ~30).

Rewritten resume JSON:
${JSON.stringify(rewritten)}

Vacancy analysis JSON:
${JSON.stringify(vacancy)}

Evidence map JSON:
${JSON.stringify(evidence)}
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

export const translatePolishPrompt = (
  facts: unknown,
  rewritten: unknown,
  targetLanguage: Language
) => `
You are a bilingual resume editor and translator. Translate and polish the resume below so that EVERY visible text field reads fluently and naturally in ${languageName[targetLanguage]}. Keep proper names, company names, and brand/tool names in their original form.

Return strict JSON matching this shape EXACTLY:

{
  "facts": {
    "name": string | null,
    "contacts": string[],
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
  },
  "rewritten": {
    "summary": string,
    "skills": string[],
    "latestRoleBullets": string[],
    "experience": [
      { "company": string, "role": string, "start": string, "end": string, "location": string | null, "bullets": string[] }
    ],
    "changedSections": [
      { "section": string, "before": string, "after": string }
    ]
  }
}

Rules:
- EVERY narrative string in the output MUST be written in ${languageName[targetLanguage]}. No sentence may remain in another language, even if it already reads that way in the input. Translate summary, bullets, role titles (when they are meaningful words like "Designer" or "Developer"), skills labels, education degree labels, project titles and descriptions, certification labels.
- This includes bullets that were added by the adaptation pass and may currently be in English — translate THEM too. Verify each bullet by re-reading it: if it is not ${languageName[targetLanguage]}, rewrite it.
- DO NOT translate: company brand names, tool names (Figma, Jira, AWS, HTML/CSS…), product names, URLs, emails, phone numbers, country codes, or personal names. These may stay in their original form embedded inside a ${languageName[targetLanguage]} sentence.
- Preserve dates exactly (e.g. "Jan 2022 — Present").
- Do NOT invent new facts. If the source is silent about something, leave it silent.
- Keep the same array lengths and entry order as input.
- Polish phrasing so it reads like a native ${languageName[targetLanguage]} resume, not a literal translation.
- Fix any grammar or awkward phrasing introduced by the rewrite.
- latestRoleBullets must correspond to the first experience entry's bullets after translation.
- Output MUST be valid JSON, no prose, no code fences.

Source facts JSON:
${JSON.stringify(facts)}

Adapted (possibly partially translated) JSON:
${JSON.stringify(rewritten)}
`.trim()

export const SYSTEM_PROMPT =
  'You are an ATS-aware resume adaptation assistant. You follow instructions precisely and respond with strict JSON when asked. You never invent facts about the candidate.'
