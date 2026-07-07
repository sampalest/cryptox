<template>
  <header class="lk-titlebar">
    <div class="lk-titlebar-spacer"></div>
    <div class="lk-titlebar-title">{{ title }}</div>
    <div class="lk-titlebar-actions">
      <button
        class="lk-titlebar-btn"
        type="button"
        aria-label="About"
        title="About"
        @click="ui.openAbout()"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
      </button>
      <button
        class="lk-titlebar-btn lk-titlebar-btn-gear"
        type="button"
        aria-label="Settings"
        title="Settings"
        @click="ui.openSettings()"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
      <template v-if="showWindowControls">
        <button
          class="lk-titlebar-btn"
          type="button"
          aria-label="Minimize"
          title="Minimize"
          @click="minimizeWindow"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <path d="M5 12h14" />
          </svg>
        </button>
        <button
          class="lk-titlebar-btn lk-titlebar-btn-close"
          type="button"
          aria-label="Close"
          title="Close"
          @click="closeWindow"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </template>
    </div>
  </header>
</template>
<script>
import { useUiStore } from "@/store/ui";

export default {
    name: "TitleBar",
    props: {
        title: {
            type: String,
            default: "LOCKASAUR"
        },
        showWindowControls: {
            type: Boolean,
            default: false
        }
    },
    setup() {
        return { ui: useUiStore() };
    },
    methods: {
        minimizeWindow() {
            window.lockasaur.window.minimize();
        },
        closeWindow() {
            window.lockasaur.window.close();
        }
    }
};
</script>
