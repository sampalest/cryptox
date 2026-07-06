<template>
    <div class="lk-rawr">
        <dino-logo :size="240" @click="replay" />
        <div class="lk-rawr-title">RAWR!</div>
        <div class="lk-rawr-sub">That is dinosaur for<br>"Thank you for using Lockasaur."</div>
        <div class="lk-rawr-hint">Your files are guarded by 65 million years of instinct.</div>
        <glass-button variant="primary" @click="goHome">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 19-7-7 7-7"></path><path d="M19 12H5"></path></svg>
            Back to safety
        </glass-button>
    </div>
</template>
<script>
// Hidden thank-you page, reached by holding the Home dino for 5 seconds.
import DinoLogo from "@/components/ui/DinoLogo.vue";
import GlassButton from "@/components/ui/GlassButton.vue";
import { useUiStore } from "@/store/ui";
import rawrMp3 from "@/assets/dinosaur_rawr.mp3";

export default {
    name: "rawr-view",
    components: {
        "dino-logo": DinoLogo,
        "glass-button": GlassButton
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
<style lang="scss" scoped>
.lk-rawr {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    width: 100%;
    height: 100%;
    text-align: center;
    animation: fadeScreen 0.5s ease-out;
}

// The dino celebrates: both front arms keep waving (the groups already have
// transform-box: fill-box and shoulder origins from DinoLogo's own styles).
.lk-rawr :deep(#Brazo) {
    animation: rawrWaveR 1.7s ease-in-out infinite;
}

.lk-rawr :deep(#Brazo2) {
    animation: rawrWaveL 1.7s ease-in-out infinite;
}

@keyframes rawrWaveR {
    0%, 100% { transform: rotate(0deg); }
    25% { transform: rotate(-15deg); }
    50% { transform: rotate(4deg); }
    75% { transform: rotate(-11deg); }
}

@keyframes rawrWaveL {
    0%, 100% { transform: rotate(0deg); }
    25% { transform: rotate(13deg); }
    50% { transform: rotate(-4deg); }
    75% { transform: rotate(9deg); }
}

.lk-rawr-title {
    margin-top: 10px;
    font-family: DynaPuff, Poppins, sans-serif;
    font-size: 40px;
    font-weight: 700;
    letter-spacing: 3px;
    color: var(--text);
    animation: dinoCheer 1.6s ease-in-out infinite;
}

.lk-rawr-sub {
    font-size: 15px;
    color: var(--dim);
    max-width: 360px;
    line-height: 1.6;
    text-align: center;
}

.lk-rawr-hint {
    font-size: 12.5px;
    color: var(--faint);
    margin-bottom: 12px;
}
</style>
