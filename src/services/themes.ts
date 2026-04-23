import type { ThemeId, ThemeTokens } from '../types'

export const THEMES: Record<ThemeId, ThemeTokens> = {
  classic: {
    id: 'classic',
    label: 'Classic Purple',
    ink: '1c2030',
    muted: '5a6275',
    accent: '4b17b4',
    ruleStyle: 'bar',
    headingCase: 'upper',
    headingFont: 'display',
    bodyFont: 'sans'
  },
  'modern-blue': {
    id: 'modern-blue',
    label: 'Modern Blue',
    ink: '0e1a2b',
    muted: '516277',
    accent: '1d4ed8',
    ruleStyle: 'underline',
    headingCase: 'upper',
    headingFont: 'sans',
    bodyFont: 'sans'
  },
  'minimal-mono': {
    id: 'minimal-mono',
    label: 'Minimal Mono',
    ink: '0b0b0b',
    muted: '6b7280',
    accent: '111827',
    ruleStyle: 'none',
    headingCase: 'upper',
    headingFont: 'sans',
    bodyFont: 'sans'
  },
  'warm-terracotta': {
    id: 'warm-terracotta',
    label: 'Warm Terracotta',
    ink: '2b1b12',
    muted: '7b5a48',
    accent: 'b5461f',
    ruleStyle: 'bar',
    headingCase: 'title',
    headingFont: 'display',
    bodyFont: 'serif'
  },
  emerald: {
    id: 'emerald',
    label: 'Emerald',
    ink: '0f1a14',
    muted: '4f6658',
    accent: '0f766e',
    ruleStyle: 'underline',
    headingCase: 'upper',
    headingFont: 'sans',
    bodyFont: 'sans'
  },
  'plum-noir': {
    id: 'plum-noir',
    label: 'Plum Noir',
    ink: '130b1d',
    muted: '5b4a6b',
    accent: '5b21b6',
    ruleStyle: 'dot',
    headingCase: 'title',
    headingFont: 'display',
    bodyFont: 'serif'
  }
}

export const THEME_ORDER: ThemeId[] = [
  'classic',
  'modern-blue',
  'minimal-mono',
  'warm-terracotta',
  'emerald',
  'plum-noir'
]

export function getTheme(id: ThemeId | undefined): ThemeTokens {
  return THEMES[id ?? 'classic'] ?? THEMES.classic
}
