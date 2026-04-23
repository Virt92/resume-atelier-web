import { defineStore } from 'pinia'
import type {
  ATSAudit,
  Critique,
  EvidenceMap,
  GapAssist,
  Language,
  Mode,
  ResumeFacts,
  RewrittenResume,
  Settings,
  StageId,
  StageState,
  ThemeId,
  VacancyAnalysis
} from '../types'
import { getDefaultKey, getDefaultModel } from '../services/falClient'

const SETTINGS_KEY = 'resume-atelier:settings'

function loadSettings(): Settings {
  const defaults: Settings = {
    falKey: getDefaultKey(),
    model: getDefaultModel(),
    language: 'English',
    mode: 'standard',
    theme: 'classic',
    selfCritique: true
  }
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return defaults
    const parsed = JSON.parse(raw) as Partial<Settings>
    const validLangs: Language[] = ['English', 'Ukrainian', 'Russian']
    const lang = validLangs.includes(parsed.language as Language)
      ? (parsed.language as Language)
      : defaults.language
    return {
      falKey: parsed.falKey || defaults.falKey,
      model: parsed.model || defaults.model,
      language: lang,
      mode: (parsed.mode as Mode) || defaults.mode,
      theme: (parsed.theme as ThemeId) || defaults.theme,
      selfCritique:
        typeof parsed.selfCritique === 'boolean'
          ? parsed.selfCritique
          : defaults.selfCritique
    }
  } catch {
    return defaults
  }
}

const initialStages: StageState[] = [
  { id: 'upload', label: 'Upload', status: 'pending' },
  { id: 'parse', label: 'Parse resume', status: 'pending' },
  { id: 'extract_facts', label: 'Extract resume facts', status: 'pending' },
  { id: 'analyze_vacancy', label: 'Analyze vacancy', status: 'pending' },
  { id: 'map_evidence', label: 'Map evidence', status: 'pending' },
  { id: 'rewrite', label: 'Rewrite sections', status: 'pending' },
  { id: 'self_critique', label: 'Self-critique', status: 'pending' },
  { id: 'refine_rewrite', label: 'Refine', status: 'pending' },
  { id: 'translate_polish', label: 'Translate & polish', status: 'pending' },
  { id: 'ats_audit', label: 'ATS audit', status: 'pending' },
  { id: 'gap_assist', label: 'Gap assist', status: 'pending' }
]

export const useSessionStore = defineStore('session', {
  state: () => ({
    settings: loadSettings(),
    settingsOpen: false,

    resumeFile: null as File | null,
    resumeText: '' as string,
    resumeHtml: '' as string,
    resumeUsedOcr: false as boolean,
    detectedLanguage: undefined as Language | undefined,

    vacancyText: '' as string,
    vacancyUrl: '' as string,

    stages: initialStages.map((s) => ({ ...s })) as StageState[],
    isRunning: false,
    error: '' as string,

    facts: null as ResumeFacts | null,
    localizedFacts: null as ResumeFacts | null,
    vacancy: null as VacancyAnalysis | null,
    evidence: null as EvidenceMap | null,
    rewritten: null as RewrittenResume | null,
    critique: null as Critique | null,
    baselineAudit: null as ATSAudit | null,
    audit: null as ATSAudit | null,
    gap: null as GapAssist | null,

    isDone: false as boolean
  }),
  getters: {
    hasResume: (s) => Boolean(s.resumeText && s.resumeText.length > 20),
    hasVacancy: (s) => Boolean(s.vacancyText && s.vacancyText.trim().length > 20),
    canRun(): boolean {
      return (
        this.hasResume &&
        this.hasVacancy &&
        !!this.settings.falKey &&
        !this.isRunning
      )
    },
    missingKey: (s) => !s.settings.falKey
  },
  actions: {
    persistSettings() {
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings))
      } catch {
        // ignore
      }
    },
    updateSettings(partial: Partial<Settings>) {
      this.settings = { ...this.settings, ...partial }
      this.persistSettings()
    },
    openSettings() {
      this.settingsOpen = true
    },
    closeSettings() {
      this.settingsOpen = false
    },
    resetPipeline() {
      this.stages = initialStages.map((s) => ({ ...s }))
      this.facts = null
      this.localizedFacts = null
      this.vacancy = null
      this.evidence = null
      this.rewritten = null
      this.critique = null
      this.baselineAudit = null
      this.audit = null
      this.gap = null
      this.error = ''
      this.isDone = false
      this.isRunning = false
    },
    markStage(id: StageId, status: StageState['status'], error?: string) {
      const s = this.stages.find((x) => x.id === id)
      if (s) {
        s.status = status
        if (error) s.error = error
      }
    },
    setResumeFile(
      file: File,
      text: string,
      html: string,
      lang?: Language,
      meta?: { usedOcr?: boolean }
    ) {
      this.resumeFile = file
      this.resumeText = text
      this.resumeHtml = html
      this.detectedLanguage = lang
      this.resumeUsedOcr = Boolean(meta?.usedOcr)
      this.markStage('upload', 'done')
      this.markStage('parse', 'done')
    }
  }
})
