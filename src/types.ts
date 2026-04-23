export type Language = 'English' | 'Ukrainian' | 'Russian'
export type Mode = 'standard' | 'safe' | 'aggressive' | 'adapt_safely'
export type ThemeId =
  | 'classic'
  | 'modern-blue'
  | 'minimal-mono'
  | 'warm-terracotta'
  | 'emerald'
  | 'plum-noir'

export interface ThemeTokens {
  id: ThemeId
  label: string
  ink: string        // primary text color (hex, no #)
  muted: string      // secondary text
  accent: string     // accent color (headings, rules)
  ruleStyle: 'underline' | 'bar' | 'dot' | 'none'
  headingCase: 'upper' | 'title'
  headingFont: 'display' | 'sans'
  bodyFont: 'sans' | 'serif'
}

export interface Settings {
  falKey: string
  model: string
  language: Language
  mode: Mode
  theme: ThemeId
  selfCritique?: boolean
}

export interface ExperienceItem {
  company: string
  role: string
  start: string
  end: string
  location?: string
  bullets: string[]
}

export interface EducationItem {
  institution: string
  degree: string
  start?: string
  end?: string
  details?: string
}

export interface ResumeFacts {
  name?: string
  contacts: string[]
  summary?: string
  experience: ExperienceItem[]
  education: EducationItem[]
  skills: string[]
  projects: { title: string; description: string }[]
  certifications: string[]
  languages: string[]
  inferredRole?: string
  sourceLanguage?: Language
}

export interface VacancyAnalysis {
  roleTitle: string
  seniority?: string
  mustHave: string[]
  preferred: string[]
  responsibilities: string[]
  tools: string[]
  domainTerms: string[]
  yearsRequired?: string
  languageRequirements: string[]
  knockoutSignals: string[]
}

export type SupportLevel = 'direct' | 'indirect' | 'unsupported'

export interface EvidenceItem {
  requirement: string
  support: SupportLevel
  evidence?: string
  note?: string
}

export interface EvidenceMap {
  items: EvidenceItem[]
  rewriteAllowed: string[]
  rewriteForbidden: string[]
  focusSummary: string[]
  focusLatestRole: string[]
  focusSkills: string[]
}

export interface RewrittenResume {
  summary: string
  skills: string[]
  latestRoleBullets: string[]
  experience: ExperienceItem[]
  changedSections: { section: string; before: string; after: string }[]
}

export interface ATSAuditBreakdown {
  mustHaveCovered: number
  mustHaveTotal: number
  toolsCovered: number
  toolsTotal: number
  languageRequirementsMet: boolean
  educationPresent: boolean
  yearsMeetsOrExceeds: boolean
  unsupportedCount: number
  penalties: string[]
}

export interface ATSAudit {
  score: number
  warnings: string[]
  keywordCoverage: { keyword: string; present: boolean }[]
  breakdown?: ATSAuditBreakdown
}

export interface GapAssist {
  transferable: string[]
  safeToStrengthen: string[]
  manualInputNeeded: string[]
}

export type StageId =
  | 'upload'
  | 'parse'
  | 'extract_facts'
  | 'analyze_vacancy'
  | 'map_evidence'
  | 'rewrite'
  | 'self_critique'
  | 'refine_rewrite'
  | 'translate_polish'
  | 'ats_audit'
  | 'gap_assist'
  | 'done'

export interface CritiqueIssue {
  section: string
  severity: 'high' | 'medium' | 'low'
  what: string
  why: string
  fix: string
}

export interface Critique {
  issues: CritiqueIssue[]
  missingKeywords: string[]
  overclaims: string[]
  generalTone?: 'concrete' | 'vague' | 'buzzwordy'
}

export type StageStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped'

export interface StageState {
  id: StageId
  label: string
  status: StageStatus
  error?: string
}
