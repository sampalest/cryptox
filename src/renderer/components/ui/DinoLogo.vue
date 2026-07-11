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
// The SVG is ~1.2 MB, so it is a dynamic import (its own async chunk)
// instead of a static ?raw import that would sit in the initial bundle. The
// import starts at module evaluation, in parallel with mounting; a runtime
// fetch() is not an option because prod loads from file:// (win.loadFile).
const dinoSvgPromise = import("@/assets/dino-vector.svg?raw");

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
        dinoMarkup: "",
        pokeSTO: null,
        rainSTO: null,
        holdSTO: null,
        holdCompleted: false
    }),
    created() {
        dinoSvgPromise.then(mod => {
            this.dinoMarkup = mod.default;
        });
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
