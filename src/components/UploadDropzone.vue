<script setup lang="ts">
import { ref } from 'vue'
import { useSessionStore } from '../stores/session'
import { detectLanguage, extractDocx } from '../services/docxReader'

const store = useSessionStore()
const dragActive = ref(false)
const loading = ref(false)
const localError = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

async function handleFile(file: File) {
  localError.value = ''
  if (!file.name.toLowerCase().endsWith('.docx')) {
    localError.value = 'Only .docx is supported in the first version.'
    return
  }
  if (file.size > 10 * 1024 * 1024) {
    localError.value = 'File is larger than 10 MB.'
    return
  }
  loading.value = true
  try {
    const parsed = await extractDocx(file)
    if (!parsed.text) {
      localError.value = 'Could not extract text from this DOCX.'
      return
    }
    const lang = detectLanguage(parsed.text)
    store.setResumeFile(file, parsed.text, parsed.html, lang)
    if (store.settings.language === 'English' && lang !== 'English') {
      store.updateSettings({ language: lang })
    }
  } catch (e) {
    localError.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  dragActive.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) void handleFile(file)
}

function onPick(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) void handleFile(file)
}

function clearResume() {
  store.resumeFile = null
  store.resumeText = ''
  store.resumeHtml = ''
  store.markStage('upload', 'pending')
  store.markStage('parse', 'pending')
}
</script>

<template>
  <div>
    <div v-if="!store.hasResume">
      <label
        class="card flex flex-col items-center justify-center gap-3 px-8 py-16 cursor-pointer text-center transition"
        :class="[
          dragActive ? 'border-accent-400 bg-accent-50/60 ring-2 ring-accent-300' : 'hover:border-ink-300'
        ]"
        @dragenter.prevent="dragActive = true"
        @dragover.prevent="dragActive = true"
        @dragleave.prevent="dragActive = false"
        @drop="onDrop"
      >
        <input
          ref="fileInput"
          type="file"
          accept=".docx"
          class="hidden"
          @change="onPick"
        />
        <div class="h-14 w-14 rounded-2xl bg-ink-100 flex items-center justify-center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 16V4M12 4l-4 4M12 4l4 4"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <path
              d="M4 17v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
        <div>
          <div class="font-display text-xl font-semibold">
            {{ loading ? 'Reading your resume…' : 'Drop your resume or click to upload' }}
          </div>
          <div class="text-ink-500 text-sm mt-1">DOCX, up to 10 MB</div>
        </div>
        <button
          type="button"
          class="btn-primary mt-2"
          :disabled="loading"
          @click.prevent="fileInput?.click()"
        >
          Choose file
        </button>
      </label>
      <p v-if="localError" class="mt-3 text-sm text-rose-600">{{ localError }}</p>
    </div>

    <div v-else class="card px-5 py-4 flex items-center gap-3">
      <div class="h-10 w-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path
            d="m5 12 5 5L20 7"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </div>
      <div class="flex-1 min-w-0">
        <div class="truncate font-medium">{{ store.resumeFile?.name }}</div>
        <div class="text-xs text-ink-500 mt-0.5">
          {{ Math.round((store.resumeFile?.size ?? 0) / 1024) }} KB ·
          detected language: {{ store.detectedLanguage ?? '—' }}
        </div>
      </div>
      <button class="btn-ghost text-sm" @click="clearResume">Replace</button>
    </div>
  </div>
</template>
