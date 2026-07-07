<template>
  <div id="app" :class="{ 'dark': theme.effectiveDark, 'platform-darwin': isMac, 'platform-frameless': isFrameless }">
    <TitleBar :title="appTitle" :show-window-controls="isFrameless" />
    <BackgroundBlobs />
    <div class="page-block" :class="{ 'page-block-muted': ui.aboutOpen || ui.settingsOpen }">
      <router-view />
    </div>
    <SettingsOverlay v-if="ui.settingsOpen" />
    <AboutOverlay v-if="ui.aboutOpen" />
    <BinaryRain v-if="ui.binaryRainActive" />
  </div>
</template>
<script>
import TitleBar from "@/components/TitleBar.vue";
import BackgroundBlobs from "@/components/BackgroundBlobs.vue";
import SettingsOverlay from "@/components/overlays/SettingsOverlay.vue";
import AboutOverlay from "@/components/overlays/AboutOverlay.vue";
import BinaryRain from "@/components/overlays/BinaryRain.vue";
import { useAppIconStore } from "@/store/appIcon";
import { useThemeStore } from "@/store/theme";
import { useUiStore } from "@/store/ui";

export default {
    components: { TitleBar, BackgroundBlobs, SettingsOverlay, AboutOverlay, BinaryRain },
    data: () => {
        return {
            appTitle: "LOCKASAUR",
            isMac: false,
            isFrameless: false
        };
    },
    setup() {
        const theme = useThemeStore();
        theme.init();
        return { theme, appIcon: useAppIconStore(), ui: useUiStore() };
    },
    watch: {
        // An "auto" icon selection resolves through the theme store, so a
        // theme change (or an OS appearance change under "system") retargets
        // the Dock icon live.
        "appIcon.resolvedIcon"() {
            this.appIcon.applyResolved();
        }
    },
    async beforeMount() {
        const appInfo = await window.lockasaur.app.getInfo();
        this.isMac = appInfo.platform === "darwin";
        this.isFrameless = appInfo.platform === "win32" || appInfo.platform === "linux";
        // Reapply the saved Dock icon choice (inert off macOS).
        this.appIcon.init(this.isMac);
    }
};
</script>
