<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useSessionStore } from '../stores/session'
import type { Language, Mode } from '../types'

const store = useSessionStore()
const localKey = ref(store.settings.falKey)
const localModel = ref(store.settings.model)
const localLang = ref<Language>(store.settings.language)
const localMode = ref<Mode>(store.settings.mode)
const localSelfCritique = ref<boolean>(store.settings.selfCritique !== false)
const localQuantify = ref<boolean>(store.settings.quantify !== false)

watch(
  () => store.settingsOpen,
  (open) => {
    if (open) {
      localKey.value = store.settings.falKey
      localModel.value = store.settings.model
      localLang.value = store.settings.language
      localMode.value = store.settings.mode
      localSelfCritique.value = store.settings.selfCritique !== false
      localQuantify.value = store.settings.quantify !== false
    }
  }
)

const save = () => {
  store.updateSettings({
    falKey: localKey.value.trim(),
    model: localModel.value.trim() || 'google/gemini-flash-1.5-8b',
    language: localLang.value,
    mode: localMode.value,
    selfCritique: localSelfCritique.value,
    quantify: localQuantify.value
  })
  store.closeSettings()
}

const keyMasked = computed(() =>
  localKey.value ? localKey.value.slice(0, 4) + '…' + localKey.value.slice(-4) : ''
)
</script>

<template>
  <div
    v-if="store.settingsOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-950/40 backdrop-blur-sm"
    @click.self="store.closeSettings()"
  >
    <div class="card max-w-lg w-full p-6 shadow-lift">
      <div class="flex items-start justify-between mb-4">
        <div>
          <h2 class="font-display text-xl font-semibold">Settings</h2>
          <p class="text-sm text-ink-500">LLM, language and adaptation mode.</p>
        </div>
        <button class="btn-ghost" aria-label="Close" @click="store.closeSettings()">✕</button>
      </div>

      <div class="space-y-4">
        <div>
          <label class="label mb-1 block">fal.ai API key</label>
          <input
            v-model="localKey"
            type="password"
            class="input font-mono"
            placeholder="fal-..."
            autocomplete="off"
          />
          <p class="text-xs text-ink-500 mt-1.5">
            Stored only in your browser's localStorage. Used directly from the client.
            <span v-if="localKey" class="text-ink-400">Current: {{ keyMasked }}</span>
          </p>
        </div>

        <div>
          <label class="label mb-1 block">Model</label>
          <input v-model="localModel" class="input font-mono text-sm" />
          <p class="text-xs text-ink-500 mt-1.5">
            fal.ai any-llm route, e.g. <code>google/gemini-flash-1.5-8b</code>,
            <code>anthropic/claude-3.5-sonnet</code>.
          </p>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label mb-1 block">Target language</label>
            <select v-model="localLang" class="input">
              <option value="English">English</option>
              <option value="Ukrainian">Ukrainian</option>
              <option value="Russian">Russian</option>
            </select>
          </div>
          <div>
            <label class="label mb-1 block">Mode</label>
            <select v-model="localMode" class="input">
              <option value="standard">Standard</option>
              <option value="safe">Safe</option>
              <option value="aggressive">Aggressive</option>
              <option value="adapt_safely">Adapt Safely</option>
            </select>
          </div>
        </div>

        <label class="flex items-start gap-3 cursor-pointer select-none">
          <input
            v-model="localSelfCritique"
            type="checkbox"
            class="mt-1 h-4 w-4 rounded border-ink-300 text-accent-600 focus:ring-accent-500"
          />
          <span class="flex-1">
            <span class="label block">Self-critique loop</span>
            <span class="text-xs text-ink-500">
              After rewriting, a senior-recruiter pass finds weaknesses and a
              refine pass applies them. Adds ~15-25s. If the refine would lower
              the ATS score, the original rewrite is kept automatically.
            </span>
          </span>
        </label>

        <label class="flex items-start gap-3 cursor-pointer select-none">
          <input
            v-model="localQuantify"
            type="checkbox"
            class="mt-1 h-4 w-4 rounded border-ink-300 text-accent-600 focus:ring-accent-500"
          />
          <span class="flex-1">
            <span class="label block">Quantify with real numbers</span>
            <span class="text-xs text-ink-500">
              Inserts real numbers from your resume's facts (tenure from dates,
              counts already stated in bullets) into the rewrite. Does NOT invent
              percentages or KPIs. If the ATS score would drop, the original is
              kept automatically.
            </span>
          </span>
        </label>
      </div>

      <div class="mt-6 flex justify-end gap-2">
        <button class="btn-secondary" @click="store.closeSettings()">Cancel</button>
        <button class="btn-primary" @click="save">Save</button>
      </div>
    </div>
  </div>
</template>
