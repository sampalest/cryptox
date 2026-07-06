<template>
  <div
    class="lk-word"
    :class="{ 'lk-word-animate': animate }"
    :style="{ fontSize: size + 'px' }"
    role="img"
    aria-label="Lockasaur"
  >
    <span
      v-for="(letter, index) in letters"
      :key="index"
      class="lk-word-letter"
      :class="{ 'lk-word-dot': letter.dot }"
      :style="letterStyle(letter, index)"
      aria-hidden="true"
    >{{ letter.char }}</span>
  </div>
</template>
<script>
// "Lock·a·saur" with the mock's blue-to-cyan letter ramp.
const LETTERS = [
    { char: "L", color: "#0766e5" },
    { char: "o", color: "#0766e5" },
    { char: "c", color: "#0766e5" },
    { char: "k", color: "#0766e5" },
    { char: "·", color: "#9fb4c8", dot: true },
    { char: "a", color: "#0e9fd6" },
    { char: "·", color: "#9fb4c8", dot: true },
    { char: "s", color: "#11d0e3" },
    { char: "a", color: "#11d0e3" },
    { char: "u", color: "#11d0e3" },
    { char: "r", color: "#11d0e3" }
];

export default {
    name: "WordMark",
    props: {
        size: {
            type: Number,
            default: 46
        },
        animate: {
            type: Boolean,
            default: false
        }
    },
    computed: {
        letters() {
            return LETTERS;
        }
    },
    methods: {
        letterStyle(letter, index) {
            const style = { color: letter.color };
            if (this.animate) {
                style.animationDelay = (0.05 + index * 0.05).toFixed(2) + "s";
            }
            return style;
        }
    }
};
</script>
<style lang="scss" scoped>
.lk-word {
    font-family: DynaPuff, Montserrat, sans-serif;
    font-weight: 600;
    line-height: 1.05;
    letter-spacing: 5px;
    text-transform: uppercase;
    padding-left: 5px;
    filter: drop-shadow(0 4px 10px rgba(7, 102, 229, 0.28));
    cursor: default;
    transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.35s ease;

    &:hover {
        transform: scale(1.04);
        filter: drop-shadow(0 9px 18px rgba(7, 102, 229, 0.38));
    }
}

.lk-word-animate {
    animation: wordBob 2.5s ease-in-out 2 both;

    .lk-word-letter {
        animation: letterPop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both;
    }
}

.lk-word-letter {
    display: inline-block;
}

.lk-word-dot {
    font-weight: 500;
}
</style>
