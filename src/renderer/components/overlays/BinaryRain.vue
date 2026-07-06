<template>
    <div class="lk-rain" aria-hidden="true">
        <div v-for="col in columns" :key="col.id" class="lk-rain-col" :style="col.style">
            <span v-for="(cell, ci) in col.cells" :key="ci" class="lk-rain-cell" :style="{ color: cell.color }">{{ cell.char }}</span>
        </div>
    </div>
</template>
<script>
// Easter-egg binary rain shown while the Home dino is held (ui.binaryRainActive).
// Pure decoration: pointer-events none, so the hold underneath keeps running.

// Matrix-style: one blue hue, but every glyph gets its own lightness so the
// column shimmers, with rare near-white "head" glyphs. currentColor also drives
// each glyph's glow via text-shadow, so the halo matches its shade.
function rainCell() {
    const bright = Math.random() < 0.07;
    const lightness = bright ? 84 + Math.random() * 10 : 38 + Math.random() * 40;
    const saturation = bright ? 65 : 95;
    return {
        char: Math.random() < 0.5 ? "0" : "1",
        color: "hsl(212, " + saturation + "%, " + lightness + "%)"
    };
}

export default {
    name: "binary-rain",
    data: () => ({
        columns: []
    }),
    created() {
        const count = 26;
        const rows = 34;
        this.columns = Array.from({ length: count }, (v, i) => ({
            id: i,
            cells: Array.from({ length: rows }, rainCell),
            style: {
                left: ((i + Math.random() * 0.8) * (100 / count)) + "%",
                fontSize: (11 + Math.random() * 8) + "px",
                opacity: String(0.35 + Math.random() * 0.55),
                animationDuration: (1.4 + Math.random() * 1.8) + "s",
                // Negative delay so the screen is already full of rain at frame one.
                animationDelay: (Math.random() * -3) + "s"
            }
        }));
    }
};
</script>
<style lang="scss" scoped>
.lk-rain {
    position: absolute;
    inset: 0;
    z-index: 30;
    overflow: hidden;
    pointer-events: none;
    border-radius: 14px;
    background: rgba(4, 10, 18, 0.55);
    animation: rainFadeIn 0.6s ease-out both;
}

.lk-rain-col {
    position: absolute;
    top: 0;
    line-height: 1.35;
    font-family: "Courier New", monospace;
    font-weight: 700;
    animation: binaryFall linear infinite;
    will-change: transform;
}

.lk-rain-cell {
    display: block;
    text-shadow: 0 0 8px currentColor;
}

@keyframes binaryFall {
    from { transform: translateY(-100%); }
    to { transform: translateY(100vh); }
}

@keyframes rainFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}
</style>
