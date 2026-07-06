<template>
  <div
    class="lk-dino"
    :style="{ width: size + 'px' }"
    role="button"
    tabindex="0"
    aria-label="Lockasaur logo"
    @click="poke"
    @keydown.enter.prevent="poke"
    @keydown.space.prevent="poke"
    @pointerdown="holdStart"
    @pointerup="holdEnd"
    @pointerleave="holdEnd"
    @pointercancel="holdEnd"
  >
    <div class="lk-dino-halo" aria-hidden="true"></div>
    <div ref="svg" class="lk-dino-svg" v-html="dinoMarkup"></div>
  </div>
</template>
<script>
// The dino mascot (dino-vector.svg), inlined (?raw + v-html) so CSS can reach
// its arm groups. Clicking pokes the dino: a small body bob plus a wave of the
// two front arms (#Brazo and #Brazo2). The shadow is a CSS drop-shadow so it
// follows the alpha shape.
import dinoSvg from "@/assets/dino-vector.svg?raw";

export default {
    name: "DinoLogo",
    props: {
        size: {
            type: Number,
            default: 260
        }
    },
    emits: ["hold-start", "hold-cancel", "hold-complete"],
    data: () => ({
        pokeSTO: null,
        rainSTO: null,
        holdSTO: null,
        holdCompleted: false
    }),
    computed: {
        dinoMarkup() {
            return dinoSvg;
        }
    },
    methods: {
        // Long-press easter egg: hold-start fires after 0.5 s of primary-button
        // hold (so quick clicks never flash the rain) and hold-complete after
        // 5 s. No pointer capture on purpose, so dragging off the dino fires
        // pointerleave and cancels the hold.
        holdStart(e) {
            if (e.button !== 0) return;
            this.holdCompleted = false;
            this.rainSTO = setTimeout(() => {
                this.rainSTO = null;
                this.$emit("hold-start");
            }, 500);
            this.holdSTO = setTimeout(() => {
                this.holdSTO = null;
                this.holdCompleted = true;
                this.$emit("hold-complete");
            }, 5000);
        },
        holdEnd() {
            if (this.holdSTO == null) return;
            clearTimeout(this.rainSTO);
            this.rainSTO = null;
            clearTimeout(this.holdSTO);
            this.holdSTO = null;
            this.$emit("hold-cancel");
        },
        poke() {
            // A completed hold still fires a trailing click; swallow it once so
            // the easter egg does not also poke.
            if (this.holdCompleted) {
                this.holdCompleted = false;
                return;
            }
            const el = this.$refs.svg;
            // Toggle with a reflow in between so a rapid re-click restarts the
            // animation instead of being ignored mid-play.
            el.classList.remove("lk-dino-poke");
            void el.offsetWidth;
            el.classList.add("lk-dino-poke");
            if (this.pokeSTO != null) clearTimeout(this.pokeSTO);
            this.pokeSTO = setTimeout(() => el.classList.remove("lk-dino-poke"), 1100);
        }
    },
    beforeUnmount() {
        clearTimeout(this.pokeSTO);
        clearTimeout(this.rainSTO);
        clearTimeout(this.holdSTO);
    }
};
</script>
<style lang="scss" scoped>
.lk-dino {
    position: relative;
    flex-shrink: 0;
    cursor: pointer;

    &:focus {
        outline: none;
    }

    &:focus-visible {
        outline: 2px solid var(--accent2);
        outline-offset: 4px;
        border-radius: 12px;
    }
}

.lk-dino-halo {
    position: absolute;
    inset: -8px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(47, 225, 229, 0.22), transparent 68%);
    animation: ringPulse 2.6s ease-out infinite;
    pointer-events: none;
}

.lk-dino-svg {
    position: relative;
    display: block;
    transform-origin: center bottom;

    :deep(svg) {
        width: 100%;
        height: auto;
        display: block;
        overflow: visible;
        filter: drop-shadow(0 18px 34px rgba(7, 102, 229, 0.32));
        animation: logoShadow 2.8s ease-in-out infinite;
    }

    // Each arm waves about its shoulder (fill-box percentages of the arm's bbox).
    :deep(#Brazo) {
        transform-box: fill-box;
        transform-origin: 10% 35%;
    }
    :deep(#Brazo2) {
        transform-box: fill-box;
        transform-origin: 55% 10%;
    }
}

.lk-dino-poke {
    animation: dinoPoke 1s ease-in-out;
}

.lk-dino-poke :deep(#Brazo) {
    animation: dinoWaveR 1s ease-in-out;
}

.lk-dino-poke :deep(#Brazo2) {
    animation: dinoWaveL 1s ease-in-out;
}

// Whole-body happy bob on poke.
@keyframes dinoPoke {
    0%, 100% { transform: scale(1) translateY(0); }
    30% { transform: scale(1.04) translateY(-5px); }
    60% { transform: scale(0.99) translateY(0); }
}

// The two front arms flap in mirrored directions.
@keyframes dinoWaveR {
    0%, 100% { transform: rotate(0deg); }
    20% { transform: rotate(-16deg); }
    45% { transform: rotate(5deg); }
    70% { transform: rotate(-12deg); }
    88% { transform: rotate(2deg); }
}

@keyframes dinoWaveL {
    0%, 100% { transform: rotate(0deg); }
    20% { transform: rotate(14deg); }
    45% { transform: rotate(-4deg); }
    70% { transform: rotate(10deg); }
    88% { transform: rotate(-2deg); }
}
</style>
