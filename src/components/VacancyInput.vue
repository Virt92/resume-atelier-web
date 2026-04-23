<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSessionStore } from '../stores/session'
import { fetchVacancy } from '../services/vacancyFetcher'

const store = useSessionStore()
const urlInput = ref('')
const urlBusy = ref(false)
const urlError = ref('')
const urlNote = ref('')

const charCount = computed(() => store.vacancyText.length)

async function fetchFromUrl() {
  urlError.value = ''
  urlNote.value = ''
  if (!urlInput.value) return
  urlBusy.value = true
  try {
    const result = await fetchVacancy(urlInput.value)
    store.vacancyText = result.text
    store.vacancyUrl = urlInput.value
    urlNote.value =
      result.source === 'direct'
        ? 'Fetched directly from the site.'
        : `Fetched via ${result.proxyUsed ?? 'proxy'} (direct CORS blocked).`
  } catch (e) {
    urlError.value = e instanceof Error ? e.message : String(e)
  } finally {
    urlBusy.value = false
  }
}
</script>

<template>
  <div class="card p-5">
    <div class="flex items-center justify-between mb-3">
      <div>
        <div class="label">Vacancy</div>
        <div class="font-display text-lg font-semibold">Paste job description</div>
      </div>
      <div class="text-xs text-ink-500" :class="charCount > 0 ? 'text-ink-600' : ''">
        {{ charCount }} chars
      </div>
    </div>

    <div class="flex gap-2 mb-3">
      <input
        v-model="urlInput"
        class="input"
        placeholder="https://jobs.dou.ua/...  (DOU, Djinni, LinkedIn, Indeed, Greenhouse, Lever supported)"
      />
      <button class="btn-secondary shrink-0" :disabled="urlBusy || !urlInput" @click="fetchFromUrl">
        {{ urlBusy ? 'Fetching…' : 'Fetch' }}
      </button>
    </div>
    <p v-if="urlError" class="text-xs text-rose-600 mb-2">{{ urlError }}</p>
    <p v-else-if="urlNote" class="text-xs text-emerald-700 mb-2">{{ urlNote }}</p>

    <textarea
      v-model="store.vacancyText"
      rows="10"
      class="input resize-y font-mono text-sm leading-relaxed"
      placeholder="Paste the vacancy text here…"
    />
  </div>
</template>
