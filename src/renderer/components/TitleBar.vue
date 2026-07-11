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
        <lk-icon name="info" :size="16" aria-hidden="true" />
      </button>
      <button
        class="lk-titlebar-btn lk-titlebar-btn-gear"
        type="button"
        aria-controls="settings-overlay"
        :aria-expanded="ui.settingsOpen"
        :aria-label="ui.settingsOpen ? 'Close Settings' : 'Settings'"
        :title="ui.settingsOpen ? 'Close Settings' : 'Settings'"
        @click="ui.toggleSettings()"
      >
        <lk-icon name="settings" :size="16" aria-hidden="true" />
      </button>
      <template v-if="showWindowControls">
        <button
          class="lk-titlebar-btn"
          type="button"
          aria-label="Minimize"
          title="Minimize"
          @click="minimizeWindow"
        >
          <lk-icon name="minus" :size="15" aria-hidden="true" />
        </button>
        <button
          class="lk-titlebar-btn lk-titlebar-btn-close"
          type="button"
          aria-label="Close"
          title="Close"
          @click="closeWindow"
        >
          <lk-icon name="close" :size="15" aria-hidden="true" />
        </button>
      </template>
    </div>
  </header>
</template>
<script>
import { useUiStore } from "@/store/ui";
import LkIcon from "@/components/ui/LkIcon.vue";

export default {
    name: "TitleBar",
    components: {
        "lk-icon": LkIcon
    },
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
