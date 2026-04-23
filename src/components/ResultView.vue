<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSessionStore } from '../stores/session'
import DiffSpan from './DiffSpan.vue'
import DiffList from './DiffList.vue'
import DiffBullets from './DiffBullets.vue'
import { buildAdaptedDocx } from '../services/docxWriter'

const store = useSessionStore()
const showDiff = ref(true)
const exporting = ref(false)

const beforeSummary = computed(() => store.facts?.summary ?? '')
const afterSummary = computed(() => store.rewritten?.summary ?? '')
// Word-diff is only meaningful when source and target are the same language.
// For cross-language rewrites (e.g. English → Ukrainian) the diff turns into
// noise — show the adapted text as-is instead.
const summaryDiffMeaningful = computed(() => {
  const src = store.detectedLanguage
  const dst = store.settings.language
  if (!src || !dst) return true
  return src === dst
})
const beforeLatestBullets = computed(
  () => store.facts?.experience?.[0]?.bullets ?? []
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

const scoreTone = computed(() => {
  const s = store.audit?.score ?? 0
  if (s >= 80) return 'text-emerald-600'
  if (s >= 60) return 'text-amber-600'
  return 'text-rose-600'
})

async function downloadDocx() {
  if (!store.facts || !store.rewritten) return
  exporting.value = true
  try {
    await buildAdaptedDocx(store.facts, store.rewritten, 'resume-adapted.docx')
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
        <div class="flex items-baseline gap-2">
          <div class="font-display text-4xl font-bold" :class="scoreTone">
            {{ store.audit?.score ?? '—' }}
          </div>
          <div class="text-ink-500 text-sm">/ 100</div>
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
          <div class="text-xs font-semibold text-accent-700 mb-1">Safe to strengthen</div>
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
      <div class="flex items-center gap-2 mb-4 no-print">
        <label class="chip bg-ink-100 text-ink-700 cursor-pointer">
          <input v-model="showDiff" type="checkbox" class="accent-accent-600" />
          Show changes
        </label>
        <div class="flex-1" />
        <button class="btn-secondary" :disabled="exporting" @click="downloadDocx">
          {{ exporting ? 'Generating…' : 'Download .docx' }}
        </button>
        <button class="btn-primary" @click="printPdf">Save as PDF</button>
      </div>

      <article class="resume-sheet card p-10 sm:p-12 print-page max-w-[860px] mx-auto">
        <header class="text-center pb-6 mb-6 relative">
          <h1 class="font-display text-4xl font-bold tracking-tight text-ink-900">
            {{ store.facts?.name ?? 'Your Name' }}
          </h1>
          <p
            v-if="store.facts?.inferredRole"
            class="text-sm uppercase tracking-[0.18em] text-accent-700 font-semibold mt-2"
          >
            {{ store.facts!.inferredRole }}
          </p>
          <p
            v-if="store.facts?.contacts?.length"
            class="text-sm text-ink-500 mt-3"
          >
            {{ store.facts!.contacts.join('  ·  ') }}
          </p>
          <div
            class="absolute bottom-0 left-1/2 -translate-x-1/2 h-[2px] w-16 bg-accent-500 rounded-full"
          />
        </header>

        <section v-if="afterSummary" class="mb-7">
          <h2 class="resume-heading">Summary</h2>
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
          <h2 class="resume-heading">Skills</h2>
          <DiffList
            :before="store.facts?.skills ?? []"
            :after="store.rewritten!.skills"
            :show-diff="showDiff"
          />
        </section>

        <section v-if="store.rewritten!.experience.length" class="mb-7">
          <h2 class="resume-heading">Experience</h2>
          <div class="space-y-6">
            <div
              v-for="(e, idx) in store.rewritten!.experience"
              :key="idx"
            >
              <div class="flex items-baseline justify-between gap-3 border-b border-ink-100 pb-1.5 mb-2">
                <div>
                  <div class="font-semibold text-ink-900">{{ e.role }}</div>
                  <div class="text-sm text-ink-600">{{ e.company }}<span v-if="e.location" class="text-ink-400"> · {{ e.location }}</span></div>
                </div>
                <div class="text-xs text-ink-500 whitespace-nowrap font-medium">
                  {{ [e.start, e.end].filter(Boolean).join(' — ') }}
                </div>
              </div>
              <DiffBullets
                v-if="idx === 0"
                :before="beforeLatestBullets"
                :after="afterLatestBullets"
                :show-diff="showDiff"
              />
              <ul v-else class="mt-2 space-y-1.5 text-[14px] text-ink-800 list-disc pl-5">
                <li v-for="(b, bi) in e.bullets" :key="bi">{{ b }}</li>
              </ul>
            </div>
          </div>
        </section>

        <section v-if="store.facts?.education?.length" class="mb-7">
          <h2 class="resume-heading">Education</h2>
          <ul class="space-y-2">
            <li
              v-for="(e, idx) in store.facts!.education"
              :key="idx"
              class="flex items-baseline justify-between gap-3 text-[14px]"
            >
              <div>
                <span class="font-medium text-ink-900">{{ e.degree }}</span>
                <span class="text-ink-600"> — {{ e.institution }}</span>
              </div>
              <span v-if="e.start || e.end" class="text-ink-500 text-xs whitespace-nowrap">
                {{ [e.start, e.end].filter(Boolean).join(' — ') }}
              </span>
            </li>
          </ul>
        </section>

        <section v-if="store.facts?.projects?.length" class="mb-7">
          <h2 class="resume-heading">Projects</h2>
          <ul class="space-y-3">
            <li v-for="(p, idx) in store.facts!.projects" :key="idx">
              <div class="font-medium text-ink-900">{{ p.title }}</div>
              <div class="text-[14px] text-ink-700 leading-relaxed">{{ p.description }}</div>
            </li>
          </ul>
        </section>

        <section v-if="store.facts?.languages?.length" class="mb-7">
          <h2 class="resume-heading">Languages</h2>
          <p class="resume-body">{{ store.facts!.languages.join('   ·   ') }}</p>
        </section>

        <section v-if="store.facts?.certifications?.length">
          <h2 class="resume-heading">Certifications</h2>
          <ul class="list-disc pl-5 space-y-1 text-[14px]">
            <li v-for="c in store.facts!.certifications" :key="c">{{ c }}</li>
          </ul>
        </section>
      </article>
    </section>
  </div>
</template>
