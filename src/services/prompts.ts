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
You rewrite the whole resume — summary, skills, and bullets of EVERY role — to
honestly match a vacancy. Your goal is to maximise ATS coverage WITHOUT lying.

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

HARD RULES (violating any of these fails the rewrite):
- Target language: ${languageName[language]}. Translate ALL narrative content into the target language.
- Mode: ${modeHint[mode]}
- NEVER invent companies, tools, products, certifications, years of experience, domains (fintech/banking/healthcare etc.), university degrees, or portfolio links that are not already in the source facts.
- NEVER copy sentences verbatim from the vacancy. Rephrase in the candidate's own voice.
- PRESERVE exactly: all dates, company names, and degree institutions. Role titles may be lightly harmonised to the vacancy title (e.g. "Designer" → "UX/UI Designer") ONLY when the candidate's actual duties already match that title.
- "experience" must contain the SAME entries as input, in the SAME order. You MAY tighten bullets of non-latest roles, but you may NOT add fictional responsibilities to them.
- "latestRoleBullets" is the rewritten bullet list for the FIRST experience entry. Put the same content into experience[0].bullets.

INTEGRATION PLAYBOOK (this is the point of the rewrite):
1. Summary: 3 to 5 sentences, 45 to 90 words total. Anchor on the candidate's real role + domain, then weave in vacancy responsibilities and tools that have DIRECT or INDIRECT support in evidence (never "unsupported"). Mention the target role title if it genuinely describes the candidate.
2. Skills: take the union of (original skills) ∪ (vacancy tools/domain terms that have direct or indirect evidence in the resume). Normalise casing. Do not add skills marked "unsupported".
3. Latest role bullets: rewrite into 6 to 10 bullets. Every bullet must be grounded in a real fact from experience[0]. Within that constraint:
   - For EACH evidence.items entry whose support is "direct" OR "indirect", produce at least one bullet (in the latest role OR an earlier role) that naturally uses the vacancy terminology for that requirement.
   - Example of honest integration: if evidence says "prototyping is present but not specifically with Figma", do NOT claim Figma. Instead phrase it as "Built high-fidelity prototypes and wireframes as part of the design system workflow", using the requirement term "prototypes/wireframes" without inventing the tool name.
   - Example of dishonest integration (forbidden): if the resume never mentions banking, do NOT write "designed banking interfaces" just because the vacancy is a bank.
4. Non-latest roles: you may tighten each bullet to use ATS-friendly phrasing (e.g. "responsive design", "design system", "cross-functional collaboration") WHEN the original bullet already implied that work. Keep the same bullet count per role. Do not add bullets to older roles.
5. Unsupported requirements: NEVER integrate them into bullets or summary. They stay in the Gap Assist output for the candidate to add manually.

Quality checks before responding:
- Re-read every bullet: does it describe something the source facts already said? If no, rewrite or delete it.
- Re-read the summary: is every claim traceable to facts? If no, soften to a neutral phrasing.
- Make sure the rewritten resume actually reads like a stronger version of the same candidate, not a template.

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
