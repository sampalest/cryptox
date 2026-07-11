<template>
    <div class="lk-overlay" role="dialog" aria-label="About">
        <word-mark :size="30" />
        <div class="lk-about-logo">
            <div class="lk-about-halo" aria-hidden="true"></div>
            <img src="@/assets/dino-vector.svg" alt="" width="124">
        </div>
        <div class="lk-about-head">
            <div class="lk-about-tagline">Encryption with <span class="lk-about-bite">bite.</span></div>
            <div class="lk-about-version">
                <span class="lk-about-version-dot" aria-hidden="true"></span>
                Version {{ version }} · local-first &amp; open source
            </div>
        </div>
        <div class="lk-about-credit">
            Designed &amp; built by <b>Sam</b>. Your files are encrypted on your device and never touch a server.
        </div>
        <a class="lk-about-github" role="button" tabindex="0"
            @click.prevent="goGithub"
            @keydown.enter.prevent="goGithub"
            @keydown.space.prevent="goGithub">
            <lk-icon name="github" :size="18" aria-hidden="true" />
            View the repo on GitHub
        </a>
        <div class="lk-about-footer">Made with 🦕 &amp; a lot of caffeine</div>
        <glass-button variant="primary" @click="ui.closeOverlays()">
            <lk-icon name="check" :size="16" aria-hidden="true" />
            Done
        </glass-button>
    </div>
</template>
<script>
import GlassButton from "@/components/ui/GlassButton.vue";
import LkIcon from "@/components/ui/LkIcon.vue";
import WordMark from "@/components/ui/Wordmark.vue";
import { useUiStore } from "@/store/ui";

export default {
    name: "about-overlay",
    components: {
        "glass-button": GlassButton,
        "lk-icon": LkIcon,
        "word-mark": WordMark
    },
    setup() {
        return { ui: useUiStore() };
    },
    computed: {
        version() {
            return __APP_VERSION__;
        }
    },
    methods: {
        goGithub() {
            window.lockasaur.shell.openExternal("https://github.com/sampalest/cryptox");
        },
        onKeydown(event) {
            if (event.key === "Escape") this.ui.closeOverlays();
        }
    },
    mounted() {
        window.addEventListener("keydown", this.onKeydown);
    },
    beforeUnmount() {
        window.removeEventListener("keydown", this.onKeydown);
    }
};
</script>
