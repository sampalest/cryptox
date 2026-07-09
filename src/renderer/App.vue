<template>
  <div id="app" :class="{ 'dark': theme.effectiveDark, 'platform-darwin': appStore.isMac, 'platform-frameless': appStore.isFrameless, 'lk-hidden': windowHidden, 'lk-drop-active': ui.dropOpen, 'lk-zoom-l': windowSize.applied === 'l', 'lk-zoom-xl': windowSize.applied === 'xl' }">
    <TitleBar :title="appTitle" :show-window-controls="appStore.isFrameless" />
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
import { defineAsyncComponent } from "vue";
import TitleBar from "@/components/TitleBar.vue";
import BackgroundBlobs from "@/components/BackgroundBlobs.vue";
import { useAppIconStore } from "@/store/appIcon";
import { useAppStore } from "@/store/app";
import { useDeleteBehaviorStore } from "@/store/deleteBehavior";
import { useErasePolicyStore } from "@/store/erasePolicy";
import { useTimeSourceStore } from "@/store/timeSource";
import { useThemeStore } from "@/store/theme";
import { useUiStore } from "@/store/ui";
import { useWindowSizeStore } from "@/store/windowSize";

export default {
    components: {
        TitleBar,
        BackgroundBlobs,
        // The overlays are v-if gated and rarely open, so each is an async
        // chunk fetched on first open (disk-local, a few ms) instead of
        // weighing down the initial bundle. Entry animations still start at
        // mount, so their timing is unchanged.
        SettingsOverlay: defineAsyncComponent(() => import("@/components/overlays/SettingsOverlay.vue")),
        AboutOverlay: defineAsyncComponent(() => import("@/components/overlays/AboutOverlay.vue")),
        BinaryRain: defineAsyncComponent(() => import("@/components/overlays/BinaryRain.vue"))
    },
    data: () => {
        return {
            appTitle: "LOCKASAUR",
            windowHidden: false,
            onVisibilityChange: null
        };
    },
    setup() {
        const theme = useThemeStore();
        theme.init();
        useDeleteBehaviorStore().init();
        useErasePolicyStore().init();
        useTimeSourceStore().init();
        // windowSize is initialized in main.js before mount; here it only
        // drives the lk-zoom-* classes that keep the titlebar unscaled.
        return { theme, appIcon: useAppIconStore(), appStore: useAppStore(), ui: useUiStore(), windowSize: useWindowSizeStore() };
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
        await this.appStore.load();
        // Reapply the saved Dock icon choice (inert off macOS).
        this.appIcon.init(this.appStore.isMac);
    },
    mounted() {
        // While the window is hidden (minimized/fully covered) the ambient
        // infinite animations pause via #app.lk-hidden (master.scss) to stop
        // burning CPU/GPU on invisible frames. Visibility only, never window
        // blur: a visible-but-unfocused window must keep animating.
        this.onVisibilityChange = () => {
            this.windowHidden = document.visibilityState === "hidden";
        };
        document.addEventListener("visibilitychange", this.onVisibilityChange);
    },
    beforeUnmount() {
        document.removeEventListener("visibilitychange", this.onVisibilityChange);
    }
};
</script>
