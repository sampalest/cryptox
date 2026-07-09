<template>
    <div class="lk-rawr">
        <dino-logo :size="240" @click="replay" />
        <div class="lk-rawr-title">RAWR!</div>
        <div class="lk-rawr-sub">That is dinosaur for<br>"Thank you for using Lockasaur."</div>
        <div class="lk-rawr-hint">Your files are guarded by 65 million years of instinct.</div>
        <glass-button variant="primary" @click="goHome">
            <lk-icon name="arrow-left" :size="16" aria-hidden="true" />
            Back to safety
        </glass-button>
    </div>
</template>
<script>
// Hidden thank-you page, reached by holding the Home dino for 5 seconds.
import DinoLogo from "@/components/ui/DinoLogo.vue";
import GlassButton from "@/components/ui/GlassButton.vue";
import LkIcon from "@/components/ui/LkIcon.vue";
import { useUiStore } from "@/store/ui";
import rawrMp3 from "@/assets/dinosaur_rawr.mp3";

export default {
    name: "rawr-view",
    components: {
        "dino-logo": DinoLogo,
        "glass-button": GlassButton,
        "lk-icon": LkIcon
    },
    setup() {
        return { ui: useUiStore() };
    },
    data: () => ({
        audio: null
    }),
    methods: {
        replay() {
            if (this.audio == null) return;
            this.audio.currentTime = 0;
            this.audio.play().catch(() => {});
        },
        goHome() {
            this.$router.push({ name: "home" });
        },
        onKeydown(event) {
            if (event.key === "Escape") this.goHome();
        }
    },
    mounted() {
        this.ui.stopBinaryRain();
        this.audio = new Audio(rawrMp3);
        this.audio.play().catch(() => {});
        window.addEventListener("keydown", this.onKeydown);
    },
    beforeUnmount() {
        window.removeEventListener("keydown", this.onKeydown);
        if (this.audio != null) {
            this.audio.pause();
            this.audio.src = "";
            this.audio = null;
        }
    }
};
</script>
