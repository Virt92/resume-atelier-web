import { diffWordsWithSpace } from 'diff'

export interface DiffSpan {
  type: 'equal' | 'added' | 'removed'
  text: string
}

export function computeDiff(before: string, after: string): DiffSpan[] {
  const parts = diffWordsWithSpace(before || '', after || '')
  return parts.map((p) => ({
    type: p.added ? 'added' : p.removed ? 'removed' : 'equal',
    text: p.value
  }))
}
