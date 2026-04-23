<script setup lang="ts">
import { computed } from 'vue'
import { useSessionStore } from './stores/session'
import { runPipeline } from './services/runner'
import AppHeader from './components/AppHeader.vue'
import SettingsModal from './components/SettingsModal.vue'
import UploadDropzone from './components/UploadDropzone.vue'
import VacancyInput from './components/VacancyInput.vue'
import PipelineProgress from './components/PipelineProgress.vue'
import ResultView from './components/ResultView.vue'

const store = useSessionStore()

const runLabel = computed(() => {
  if (store.isRunning) return 'Adapting…'
  if (store.isDone) return 'Adapt again'
  return 'Adapt resume'
})

async function start() {
  if (store.missingKey) {
    store.openSettings()
    return
  }
  await runPipeline()
}
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <AppHeader />

    <main class="flex-1">
      <!-- Hero + working zone -->
      <section v-if="!store.isDone" class="max-w-3xl mx-auto px-6 pt-12 pb-6 text-center no-print">
        <span class="chip bg-accent-100 text-accent-700 mb-4">ATS-aware · Honest · Fast</span>
        <h1 class="font-display text-4xl sm:text-5xl font-bold tracking-tight">
          Tailor your resume to any vacancy.
        </h1>
        <p class="text-ink-500 mt-4 text-lg max-w-xl mx-auto">
          Upload your DOCX, paste the job description, and get a truthful, ATS-friendly adaptation —
          with diff, evidence map, and honest gap assist.
        </p>
      </section>

      <div class="max-w-3xl mx-auto px-6 pb-10" v-if="!store.isDone">
        <UploadDropzone />

        <div v-if="store.hasResume" class="mt-4">
          <VacancyInput />
        </div>

        <div v-if="store.hasResume && store.hasVacancy" class="mt-4 space-y-4">
          <PipelineProgress v-if="store.isRunning || store.stages.some(s => s.status !== 'pending')" />

          <div v-if="store.error" class="card p-4 border-rose-200 bg-rose-50 text-sm text-rose-800">
            {{ store.error }}
          </div>

          <div class="flex items-center justify-between gap-3">
            <div class="text-xs text-ink-500">
              Language:
              <button class="underline underline-offset-2" @click="store.openSettings()">
                {{ store.settings.language }}
              </button>
              · Mode:
              <button class="underline underline-offset-2" @click="store.openSettings()">
                {{ store.settings.mode }}
              </button>
              <span v-if="store.missingKey" class="text-rose-600 ml-2">· API key required</span>
            </div>
            <button
              class="btn-primary text-base px-6 py-3"
              :disabled="!store.hasResume || !store.hasVacancy || store.isRunning"
              @click="start"
            >
              {{ runLabel }}
            </button>
          </div>
        </div>
      </div>

      <!-- Result -->
      <section v-if="store.isDone" class="max-w-6xl mx-auto px-6 pb-16">
        <div class="flex items-center justify-between mb-6 no-print">
          <div>
            <h1 class="font-display text-3xl font-bold tracking-tight">Adapted resume</h1>
            <p class="text-ink-500 text-sm mt-1">
              Review the changes, then download DOCX or save as PDF.
            </p>
          </div>
          <button class="btn-secondary" @click="store.resetPipeline(); store.resumeFile = null; store.resumeText = ''; store.vacancyText = ''">
            Start over
          </button>
        </div>
        <ResultView />
      </section>
    </main>

    <footer class="no-print py-8 text-center text-xs text-ink-400">
      Built with Vue 3, Vite, Tailwind — runs entirely in your browser. Your resume is not uploaded
      anywhere; only the text content is sent to fal.ai for adaptation.
    </footer>

    <SettingsModal />
  </div>
</template>
