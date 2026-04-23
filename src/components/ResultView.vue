<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSessionStore } from '../stores/session'
import DiffSpan from './DiffSpan.vue'
import DiffList from './DiffList.vue'
import DiffBullets from './DiffBullets.vue'
import { buildAdaptedDocx } from '../services/docxWriter'
import { THEME_ORDER, THEMES, getTheme } from '../services/themes'
import type { ThemeId } from '../types'

const store = useSessionStore()
const showDiff = ref(true)
const exporting = ref(false)

// Prefer localized facts when we've run the translate+polish stage, so that
// non-latest roles, education and projects display in the target language too.
const factsForDisplay = computed(() => store.localizedFacts ?? store.facts)

const beforeSummary = computed(() => factsForDisplay.value?.summary ?? '')
const afterSummary = computed(() => store.rewritten?.summary ?? '')

const summaryDiffMeaningful = computed(() => {
  const src = store.detectedLanguage
  const dst = store.settings.language
  if (!src || !dst) return true
  return src === dst
})

const beforeLatestBullets = computed(
  () => factsForDisplay.value?.experience?.[0]?.bullets ?? []
)
const afterLatestBullets = computed(() => store.rewritten?.latestRoleBullets ?? [])

const unsupported = computed(
  () => store.evidence?.items.filter((i) => i.support === 'unsupported') ?? []
)
const directMatches = computed(
  () => store.evidence?.items.filter((i) => i.support === 'direct') ?? []
)
const indirectMatches = computed(
  () => store.evidence?.items.filter((i) => i.support === 'indirect') ?? []
)

function scoreTone(score: number): string {
  if (score >= 80) return 'text-emerald-600'
  if (score >= 60) return 'text-amber-600'
  return 'text-rose-600'
}

const baselineScore = computed(() => store.baselineAudit?.score ?? null)
const finalScore = computed(() => store.audit?.score ?? null)
const scoreDelta = computed(() => {
  if (baselineScore.value == null || finalScore.value == null) return null
  return finalScore.value - baselineScore.value
})

// Theme plumbing: apply tokens as inline CSS variables on the resume sheet so
// live preview re-renders instantly when the dropdown changes.
const theme = computed(() => getTheme(store.settings.theme))
const sheetStyle = computed(() => ({
  ['--resume-ink' as string]: `#${theme.value.ink}`,
  ['--resume-muted' as string]: `#${theme.value.muted}`,
  ['--resume-accent' as string]: `#${theme.value.accent}`
}))
const headingClasses = computed(() => {
  const c: string[] = ['resume-heading']
  c.push(theme.value.headingCase === 'upper' ? 'resume-heading--upper' : 'resume-heading--title')
  c.push(`resume-heading--rule-${theme.value.ruleStyle}`)
  if (theme.value.headingFont === 'display') c.push('font-display')
  return c
})
const bodyFontClass = computed(() =>
  theme.value.bodyFont === 'serif' ? 'resume-body--serif' : 'resume-body--sans'
)

function setTheme(id: ThemeId) {
  store.updateSettings({ theme: id })
}

async function downloadDocx() {
  const facts = factsForDisplay.value
  if (!facts || !store.rewritten) return
  exporting.value = true
  try {
    await buildAdaptedDocx(facts, store.rewritten, 'resume-adapted.docx', theme.value)
  } finally {
    exporting.value = false
  }
}

function printPdf() {
  window.print()
}
</script>

<template>
  <div v-if="store.isDone && store.rewritten" class="grid lg:grid-cols-[320px_1fr] gap-6 mt-6">
    <!-- Sidebar -->
    <aside class="space-y-4 no-print lg:sticky lg:top-20 lg:self-start">
      <div class="card p-5">
        <div class="label mb-1">ATS audit</div>
        <div v-if="baselineScore != null && finalScore != null" class="flex items-baseline gap-3">
          <div class="flex items-baseline gap-1">
            <div class="font-display text-2xl font-bold" :class="scoreTone(baselineScore)">
              {{ baselineScore }}
            </div>
            <div class="text-ink-400 text-xs">before</div>
          </div>
          <div class="text-ink-300 text-xl leading-none">→</div>
          <div class="flex items-baseline gap-1">
            <div class="font-display text-4xl font-bold" :class="scoreTone(finalScore)">
              {{ finalScore }}
            </div>
            <div class="text-ink-500 text-sm">/ 100</div>
          </div>
        </div>
        <div v-else class="flex items-baseline gap-2">
          <div class="font-display text-4xl font-bold" :class="scoreTone(finalScore ?? 0)">
            {{ finalScore ?? '—' }}
          </div>
          <div class="text-ink-500 text-sm">/ 100</div>
        </div>
        <div
          v-if="scoreDelta != null"
          class="mt-1 text-xs font-medium"
          :class="scoreDelta > 0 ? 'text-emerald-700' : scoreDelta < 0 ? 'text-rose-700' : 'text-ink-500'"
        >
          <template v-if="scoreDelta > 0">▲ +{{ scoreDelta }} after adaptation</template>
          <template v-else-if="scoreDelta < 0">▼ {{ scoreDelta }} after adaptation</template>
          <template v-else>No change</template>
        </div>
        <div
          v-if="store.audit?.breakdown?.penalties?.length"
          class="mt-3 text-xs text-ink-600 space-y-0.5"
        >
          <div class="label text-ink-500 mb-1">How we got there</div>
          <div v-for="p in store.audit!.breakdown!.penalties" :key="p">{{ p }}</div>
        </div>
        <div
          v-if="store.audit?.warnings?.length"
          class="mt-3 space-y-1.5 text-xs text-amber-800"
        >
          <div class="label text-amber-700">Warnings</div>
          <ul class="list-disc pl-4 space-y-0.5">
            <li v-for="w in store.audit!.warnings" :key="w">{{ w }}</li>
          </ul>
        </div>
        <div
          v-if="store.audit?.keywordCoverage?.length"
          class="mt-3"
        >
          <div class="label mb-1.5">Keywords</div>
          <div class="flex flex-wrap gap-1.5">
            <span
              v-for="k in store.audit!.keywordCoverage"
              :key="k.keyword"
              class="chip"
              :class="
                k.present
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-rose-100 text-rose-700 line-through decoration-rose-400/60'
              "
            >
              {{ k.keyword }}
            </span>
          </div>
        </div>
      </div>

      <div v-if="unsupported.length" class="card p-5">
        <div class="label mb-2 text-rose-700">Unsupported requirements</div>
        <ul class="space-y-1.5 text-sm">
          <li v-for="u in unsupported" :key="u.requirement" class="text-ink-800">
            <span class="font-medium">{{ u.requirement }}</span>
            <div v-if="u.note" class="text-xs text-ink-500">{{ u.note }}</div>
          </li>
        </ul>
      </div>

      <div v-if="directMatches.length || indirectMatches.length" class="card p-5">
        <div class="label mb-2">Evidence map</div>
        <div v-if="directMatches.length" class="mb-3">
          <div class="text-xs font-semibold text-emerald-700 mb-1">Direct</div>
          <ul class="space-y-0.5 text-sm">
            <li v-for="d in directMatches" :key="d.requirement">{{ d.requirement }}</li>
          </ul>
        </div>
        <div v-if="indirectMatches.length">
          <div class="text-xs font-semibold text-amber-700 mb-1">Indirect</div>
          <ul class="space-y-0.5 text-sm">
            <li v-for="d in indirectMatches" :key="d.requirement">{{ d.requirement }}</li>
          </ul>
        </div>
      </div>

      <div v-if="store.gap" class="card p-5 space-y-3">
        <div class="label">Safe adaptation</div>
        <div v-if="store.gap.transferable.length">
          <div class="text-xs font-semibold text-emerald-700 mb-1">Transferable</div>
          <ul class="list-disc pl-4 space-y-0.5 text-sm">
            <li v-for="t in store.gap.transferable" :key="t">{{ t }}</li>
          </ul>
        </div>
        <div v-if="store.gap.safeToStrengthen.length">
          <div class="text-xs font-semibold mb-1" style="color: var(--resume-accent, #4b17b4)">Safe to strengthen</div>
          <ul class="list-disc pl-4 space-y-0.5 text-sm">
            <li v-for="t in store.gap.safeToStrengthen" :key="t">{{ t }}</li>
          </ul>
        </div>
        <div v-if="store.gap.manualInputNeeded.length">
          <div class="text-xs font-semibold text-ink-600 mb-1">You should add manually (only if true)</div>
          <ul class="list-disc pl-4 space-y-0.5 text-sm">
            <li v-for="t in store.gap.manualInputNeeded" :key="t">{{ t }}</li>
          </ul>
        </div>
      </div>
    </aside>

    <!-- Preview -->
    <section>
      <div class="flex flex-wrap items-center gap-2 mb-4 no-print">
        <label class="chip bg-ink-100 text-ink-700 cursor-pointer">
          <input v-model="showDiff" type="checkbox" class="accent-accent-600" />
          Show changes
        </label>
        <div class="relative">
          <label class="block text-[10px] uppercase tracking-wider text-ink-400 mb-1">Theme</label>
          <select
            :value="store.settings.theme"
            class="text-sm bg-white border border-ink-200 rounded-lg px-2.5 py-1.5 pr-8 focus:outline-none focus:ring-2 focus:ring-accent-400"
            @change="setTheme(($event.target as HTMLSelectElement).value as ThemeId)"
          >
            <option v-for="id in THEME_ORDER" :key="id" :value="id">
              {{ THEMES[id].label }}
            </option>
          </select>
        </div>
        <div class="flex-1" />
        <button class="btn-secondary" :disabled="exporting" @click="downloadDocx">
          {{ exporting ? 'Generating…' : 'Download .docx' }}
        </button>
        <button class="btn-primary" @click="printPdf">Save as PDF</button>
      </div>

      <article
        class="resume-sheet card p-10 sm:p-12 print-page max-w-[860px] mx-auto"
        :class="[`resume-theme-${theme.id}`, bodyFontClass]"
        :style="sheetStyle"
      >
        <header class="text-center pb-6 mb-6 relative">
          <h1
            class="text-4xl font-bold tracking-tight"
            :class="theme.headingFont === 'display' ? 'font-display' : 'font-sans'"
            style="color: var(--resume-ink, #1c2030)"
          >
            {{ factsForDisplay?.name ?? 'Your Name' }}
          </h1>
          <p
            v-if="factsForDisplay?.inferredRole"
            class="text-sm font-semibold mt-2"
            :class="theme.headingCase === 'upper' ? 'uppercase tracking-[0.18em]' : ''"
            style="color: var(--resume-accent, #4b17b4)"
          >
            {{ factsForDisplay!.inferredRole }}
          </p>
          <p
            v-if="factsForDisplay?.contacts?.length"
            class="text-sm mt-3"
            style="color: var(--resume-muted, #5a6275)"
          >
            {{ factsForDisplay!.contacts.join('  ·  ') }}
          </p>
          <div
            v-if="theme.ruleStyle !== 'none'"
            class="absolute bottom-0 left-1/2 -translate-x-1/2 h-[2px] w-16 rounded-full"
            style="background-color: var(--resume-accent, #4b17b4)"
          />
        </header>

        <section v-if="afterSummary" class="mb-7">
          <h2 :class="headingClasses">Summary</h2>
          <p class="resume-body" :title="beforeSummary">
            <DiffSpan
              v-if="showDiff && summaryDiffMeaningful"
              :before="beforeSummary"
              :after="afterSummary"
            />
            <span v-else>{{ afterSummary }}</span>
          </p>
          <p
            v-if="showDiff && !summaryDiffMeaningful"
            class="mt-1 text-[11px] text-ink-400"
          >
            Summary was rewritten in {{ store.settings.language }} (source was {{ store.detectedLanguage }}); inline diff hidden because languages differ.
          </p>
        </section>

        <section v-if="store.rewritten!.skills.length" class="mb-7">
          <h2 :class="headingClasses">Skills</h2>
          <DiffList
            :before="factsForDisplay?.skills ?? []"
            :after="store.rewritten!.skills"
            :show-diff="showDiff && summaryDiffMeaningful"
          />
        </section>

        <section v-if="store.rewritten!.experience.length" class="mb-7">
          <h2 :class="headingClasses">Experience</h2>
          <div class="space-y-6">
            <div
              v-for="(e, idx) in store.rewritten!.experience"
              :key="idx"
            >
              <div class="flex items-baseline justify-between gap-3 border-b border-ink-100 pb-1.5 mb-2">
                <div>
                  <div class="font-semibold" style="color: var(--resume-ink, #1c2030)">{{ e.role }}</div>
                  <div class="text-sm" style="color: var(--resume-muted, #5a6275)">{{ e.company }}<span v-if="e.location" class="text-ink-400"> · {{ e.location }}</span></div>
                </div>
                <div class="text-xs whitespace-nowrap font-medium" style="color: var(--resume-muted, #5a6275)">
                  {{ [e.start, e.end].filter(Boolean).join(' — ') }}
                </div>
              </div>
              <DiffBullets
                v-if="idx === 0"
                :before="beforeLatestBullets"
                :after="afterLatestBullets"
                :show-diff="showDiff && summaryDiffMeaningful"
              />
              <ul v-else class="mt-2 space-y-1.5 text-[14px] list-disc pl-5" style="color: var(--resume-ink, #1c2030)">
                <li v-for="(b, bi) in e.bullets" :key="bi">{{ b }}</li>
              </ul>
            </div>
          </div>
        </section>

        <section v-if="factsForDisplay?.education?.length" class="mb-7">
          <h2 :class="headingClasses">Education</h2>
          <ul class="space-y-2">
            <li
              v-for="(e, idx) in factsForDisplay!.education"
              :key="idx"
              class="flex items-baseline justify-between gap-3 text-[14px]"
            >
              <div>
                <span class="font-medium" style="color: var(--resume-ink, #1c2030)">{{ e.degree }}</span>
                <span style="color: var(--resume-muted, #5a6275)"> — {{ e.institution }}</span>
              </div>
              <span v-if="e.start || e.end" class="text-xs whitespace-nowrap" style="color: var(--resume-muted, #5a6275)">
                {{ [e.start, e.end].filter(Boolean).join(' — ') }}
              </span>
            </li>
          </ul>
        </section>

        <section v-if="factsForDisplay?.projects?.length" class="mb-7">
          <h2 :class="headingClasses">Projects</h2>
          <ul class="space-y-3">
            <li v-for="(p, idx) in factsForDisplay!.projects" :key="idx">
              <div class="font-medium" style="color: var(--resume-ink, #1c2030)">{{ p.title }}</div>
              <div v-if="p.description" class="text-[14px]" style="color: var(--resume-muted, #5a6275)">{{ p.description }}</div>
            </li>
          </ul>
        </section>

        <section v-if="factsForDisplay?.languages?.length" class="mb-7">
          <h2 :class="headingClasses">Languages</h2>
          <div class="text-[14px]" style="color: var(--resume-ink, #1c2030)">
            {{ factsForDisplay!.languages.join('   ·   ') }}
          </div>
        </section>

        <section v-if="factsForDisplay?.certifications?.length" class="mb-7">
          <h2 :class="headingClasses">Certifications</h2>
          <ul class="list-disc pl-5 space-y-1 text-[14px]" style="color: var(--resume-ink, #1c2030)">
            <li v-for="(c, idx) in factsForDisplay!.certifications" :key="idx">{{ c }}</li>
          </ul>
        </section>
      </article>
    </section>
  </div>
</template>

<style>
.resume-sheet {
  color: var(--resume-ink, #1c2030);
}
.resume-heading {
  font-weight: 700;
  color: var(--resume-accent, #4b17b4);
  margin-bottom: 0.5rem;
  letter-spacing: 0.05em;
}
.resume-heading--upper {
  text-transform: uppercase;
  font-size: 0.75rem;
  letter-spacing: 0.14em;
}
.resume-heading--title {
  text-transform: none;
  font-size: 0.95rem;
  letter-spacing: 0.02em;
}
.resume-heading--rule-underline {
  border-bottom: 1px solid var(--resume-accent, #4b17b4);
  padding-bottom: 4px;
}
.resume-heading--rule-bar {
  border-left: 3px solid var(--resume-accent, #4b17b4);
  padding-left: 8px;
}
.resume-heading--rule-dot::after {
  content: '';
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-left: 8px;
  border-radius: 50%;
  background: var(--resume-accent, #4b17b4);
  vertical-align: middle;
}
.resume-heading--rule-none { }
.resume-body {
  color: var(--resume-ink, #1c2030);
  font-size: 14px;
  line-height: 1.55;
}
.resume-body--serif {
  font-family: Cambria, 'Times New Roman', Georgia, serif;
}
.resume-body--sans {
  font-family: inherit;
}
</style>
