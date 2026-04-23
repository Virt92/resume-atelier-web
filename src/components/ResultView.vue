<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSessionStore } from '../stores/session'
import DiffSpan from './DiffSpan.vue'
import { buildAdaptedDocx } from '../services/docxWriter'

const store = useSessionStore()
const showDiff = ref(true)
const exporting = ref(false)

const beforeSummary = computed(() => store.facts?.summary ?? '')
const afterSummary = computed(() => store.rewritten?.summary ?? '')
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
          <div class="font-display text-4xl font-bold text-ink-900">
            {{ store.audit?.score ?? '—' }}
          </div>
          <div class="text-ink-500 text-sm">/ 100</div>
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

      <article class="card p-10 print-page max-w-[850px] mx-auto">
        <header class="text-center border-b border-ink-100 pb-6 mb-6">
          <h1 class="font-display text-3xl font-bold tracking-tight">
            {{ store.facts?.name ?? 'Your Name' }}
          </h1>
          <p v-if="store.facts?.contacts?.length" class="text-sm text-ink-500 mt-2">
            {{ store.facts!.contacts.join('  ·  ') }}
          </p>
        </header>

        <section v-if="afterSummary" class="mb-6">
          <h2 class="label mb-2">Summary</h2>
          <p class="text-[15px] leading-relaxed" :title="beforeSummary">
            <DiffSpan
              v-if="showDiff"
              :before="beforeSummary"
              :after="afterSummary"
            />
            <span v-else>{{ afterSummary }}</span>
          </p>
        </section>

        <section v-if="store.rewritten!.skills.length" class="mb-6">
          <h2 class="label mb-2">Skills</h2>
          <p class="text-[14px] leading-relaxed text-ink-800">
            <DiffSpan
              v-if="showDiff"
              :before="store.facts?.skills.join(' · ') ?? ''"
              :after="store.rewritten!.skills.join(' · ')"
            />
            <span v-else>{{ store.rewritten!.skills.join(' · ') }}</span>
          </p>
        </section>

        <section v-if="store.rewritten!.experience.length" class="mb-6">
          <h2 class="label mb-3">Experience</h2>
          <div class="space-y-5">
            <div
              v-for="(e, idx) in store.rewritten!.experience"
              :key="idx"
            >
              <div class="flex items-baseline justify-between gap-3">
                <div>
                  <div class="font-semibold text-ink-900">{{ e.role }}</div>
                  <div class="text-sm text-ink-600">{{ e.company }}</div>
                </div>
                <div class="text-xs text-ink-500 whitespace-nowrap">
                  {{ [e.start, e.end].filter(Boolean).join(' — ') }}
                </div>
              </div>
              <ul class="mt-2 space-y-1.5 text-[14px] text-ink-800 list-disc pl-5">
                <li v-for="(b, bi) in idx === 0 ? afterLatestBullets : e.bullets" :key="bi">
                  <template v-if="idx === 0 && showDiff">
                    <DiffSpan
                      :before="beforeLatestBullets[bi] ?? ''"
                      :after="b"
                    />
                  </template>
                  <template v-else>{{ b }}</template>
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section v-if="store.facts?.education?.length" class="mb-6">
          <h2 class="label mb-2">Education</h2>
          <ul class="space-y-2">
            <li
              v-for="(e, idx) in store.facts!.education"
              :key="idx"
              class="text-[14px]"
            >
              <span class="font-medium">{{ e.degree }}</span>
              <span class="text-ink-600"> — {{ e.institution }}</span>
              <span v-if="e.start || e.end" class="text-ink-500 text-xs ml-2">
                {{ [e.start, e.end].filter(Boolean).join(' — ') }}
              </span>
            </li>
          </ul>
        </section>

        <section v-if="store.facts?.projects?.length" class="mb-6">
          <h2 class="label mb-2">Projects</h2>
          <ul class="space-y-2">
            <li v-for="(p, idx) in store.facts!.projects" :key="idx">
              <div class="font-medium">{{ p.title }}</div>
              <div class="text-[14px] text-ink-700">{{ p.description }}</div>
            </li>
          </ul>
        </section>

        <section v-if="store.facts?.certifications?.length">
          <h2 class="label mb-2">Certifications</h2>
          <ul class="list-disc pl-5 space-y-1 text-[14px]">
            <li v-for="c in store.facts!.certifications" :key="c">{{ c }}</li>
          </ul>
        </section>
      </article>
    </section>
  </div>
</template>
