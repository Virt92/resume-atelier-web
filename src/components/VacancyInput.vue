<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSessionStore } from '../stores/session'

const store = useSessionStore()
const urlInput = ref('')
const urlBusy = ref(false)
const urlError = ref('')

const charCount = computed(() => store.vacancyText.length)

async function fetchFromUrl() {
  urlError.value = ''
  if (!urlInput.value) return
  urlBusy.value = true
  try {
    // Try direct fetch first; likely blocked by CORS on most job boards.
    try {
      const res = await fetch(urlInput.value, { mode: 'cors' })
      if (res.ok) {
        const html = await res.text()
        const text = htmlToText(html)
        if (text.length > 200) {
          store.vacancyText = text
          store.vacancyUrl = urlInput.value
          return
        }
      }
    } catch {
      // ignore and fall through
    }
    urlError.value =
      'Could not fetch this URL from the browser (CORS). Open the vacancy page, copy the text, and paste it below.'
  } finally {
    urlBusy.value = false
  }
}

function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('script, style, nav, header, footer, noscript').forEach((n) => n.remove())
  return (doc.body?.innerText || '').replace(/\n{3,}/g, '\n\n').trim()
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
        placeholder="https://company.com/jobs/123  (optional — many boards block direct fetch)"
      />
      <button class="btn-secondary shrink-0" :disabled="urlBusy || !urlInput" @click="fetchFromUrl">
        {{ urlBusy ? 'Fetching…' : 'Fetch' }}
      </button>
    </div>
    <p v-if="urlError" class="text-xs text-rose-600 mb-2">{{ urlError }}</p>

    <textarea
      v-model="store.vacancyText"
      rows="10"
      class="input resize-y font-mono text-sm leading-relaxed"
      placeholder="Paste the vacancy text here…"
    />
  </div>
</template>
