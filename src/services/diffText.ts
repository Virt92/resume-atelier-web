import { diffWordsWithSpace } from 'diff'

export interface DiffSpan {
  type: 'equal' | 'added' | 'removed'
  text: string
}

export interface DiffItem {
  type: 'equal' | 'added' | 'removed'
  value: string
}

export interface BulletDiffPair {
  /** If both are present: modified bullet; one only: added/removed. */
  before?: string
  after?: string
  kind: 'equal' | 'added' | 'removed' | 'modified'
  /** Word-level diff spans when kind=modified. */
  spans?: DiffSpan[]
}

export function computeDiff(before: string, after: string): DiffSpan[] {
  const parts = diffWordsWithSpace(before || '', after || '')
  return parts.map((p) => ({
    type: p.added ? 'added' : p.removed ? 'removed' : 'equal',
    text: p.value
  }))
}

/** Normalize for comparison only (doesn't alter the displayed value). */
function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Item-level diff for string arrays (e.g. skills).
 * Classifies each unique item as equal / added / removed.
 * Equal items appear once, in the order they appear in `after`.
 */
export function computeListDiff(before: string[], after: string[]): DiffItem[] {
  const beforeSet = new Set(before.map(norm))
  const afterSet = new Set(after.map(norm))
  const out: DiffItem[] = []

  for (const item of after) {
    const n = norm(item)
    if (beforeSet.has(n)) {
      out.push({ type: 'equal', value: item })
    } else {
      out.push({ type: 'added', value: item })
    }
  }
  for (const item of before) {
    const n = norm(item)
    if (!afterSet.has(n)) {
      out.push({ type: 'removed', value: item })
    }
  }
  return out
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0
  const aw = new Set(a.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])
  const bw = new Set(b.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])
  if (!aw.size || !bw.size) return 0
  let common = 0
  for (const w of aw) if (bw.has(w)) common++
  return common / Math.max(aw.size, bw.size)
}

/**
 * Pair bullets by greedy similarity so we never merge mid-word.
 * Pairs with similarity >= 0.35 become "modified" (word-diff inside);
 * unmatched remain as pure added/removed.
 */
export function computeBulletDiff(
  before: string[],
  after: string[]
): BulletDiffPair[] {
  const pairs: BulletDiffPair[] = []
  const usedBefore = new Set<number>()

  for (const a of after) {
    let bestIdx = -1
    let bestScore = 0
    for (let i = 0; i < before.length; i++) {
      if (usedBefore.has(i)) continue
      const s = similarity(before[i], a)
      if (s > bestScore) {
        bestScore = s
        bestIdx = i
      }
    }

    if (bestIdx >= 0 && bestScore >= 0.35) {
      usedBefore.add(bestIdx)
      const b = before[bestIdx]
      if (norm(a) === norm(b)) {
        pairs.push({ kind: 'equal', before: b, after: a })
      } else {
        pairs.push({
          kind: 'modified',
          before: b,
          after: a,
          spans: computeDiff(b, a)
        })
      }
    } else {
      pairs.push({ kind: 'added', after: a })
    }
  }

  for (let i = 0; i < before.length; i++) {
    if (!usedBefore.has(i)) {
      pairs.push({ kind: 'removed', before: before[i] })
    }
  }

  return pairs
}
