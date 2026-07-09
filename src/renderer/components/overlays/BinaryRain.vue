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
