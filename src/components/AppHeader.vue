<script setup lang="ts">
import { useSessionStore } from '../stores/session'

const store = useSessionStore()
</script>

<template>
  <header class="no-print sticky top-0 z-20 backdrop-blur bg-ink-50/80 border-b border-ink-100">
    <div class="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <div
          class="h-8 w-8 rounded-lg bg-gradient-to-br from-accent-500 to-accent-700 flex items-center justify-center text-white font-bold"
        >
          R
        </div>
        <div class="font-display text-lg font-semibold tracking-tight">Resume Atelier</div>
        <span class="chip bg-ink-100 text-ink-600 ml-2">beta</span>
      </div>
      <div class="flex items-center gap-2">
        <a
          href="https://github.com/Virt92/resume-atelier-web"
          target="_blank"
          rel="noopener"
          class="btn-ghost text-sm"
          >GitHub</a
        >
        <button class="btn-ghost text-sm" @click="store.openSettings()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <path
              d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          Settings
        </button>
      </div>
    </div>
  </header>
</template>
