<template>
  <div
    class="lk-lock"
    :class="'lk-lock-' + lockState"
    :style="{ width: size + 'px', height: boxHeight + 'px' }"
    aria-hidden="true"
  >
    <img
      v-if="isClosed"
      class="lk-lock-closed"
      src="@/assets/lockasaur-closed.png"
      alt=""
      :style="{ width: closedWidth + 'px' }"
    >
    <div v-else class="lk-lock-open" v-html="lockSvg"></div>
  </div>
</template>
<script>
// Two artworks, one per state, so each looks right:
//  - locked/locking uses lockasaur-closed.png, which has a genuine STRAIGHT
//    shackle. The open SVG's shackle is an asymmetric open hook (short arrow-
//    tipped right leg), so no rotation can turn it into a straight closed loop.
//  - open/unlocking uses lockasaur-open.svg, whose #Arco shackle springs open.
import lockSvg from "@/assets/lockasaur-open.svg?raw";

// The open SVG artwork fills its 841x1068 viewBox, but the closed PNG carries
// transparent padding (its art spans only ~59.6% of the 560px canvas width, by
// alpha bounding box). The root box is sized to the open artwork and the closed
// image is upscaled to compensate, so swapping states never changes the visual
// lock size or the layout box.
const OPEN_ASPECT = 1068 / 841;
const CLOSED_ART_WIDTH_FRAC = 0.5964;

export default {
    name: "LockasaurLock",
    props: {
        size: {
            type: Number,
            default: 150
        },
        lockState: {
            type: String,
            default: "open",
            validator: (value) => ["open", "locked", "locking", "unlocking"].includes(value)
        }
    },
    computed: {
        isClosed() {
            return this.lockState === "locking" || this.lockState === "locked";
        },
        boxHeight() {
            return Math.round(this.size * OPEN_ASPECT);
        },
        closedWidth() {
            return Math.round(this.size / CLOSED_ART_WIDTH_FRAC);
        },
        lockSvg() {
            return lockSvg;
        }
    }
};
</script>
<style lang="scss" scoped>
.lk-lock {
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 0;
}

.lk-lock-closed {
    display: block;
    height: auto;
    flex: none;
    filter: drop-shadow(0 12px 20px rgba(7, 102, 229, 0.3));
}

// Locking (encrypt success): the closed lock fades in while settling into
// place with a soft "thunk", no harsh bounce.
.lk-lock-locking .lk-lock-closed {
    transform-origin: 50% 35%;
    animation: lockThunk 1.5s cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes lockThunk {
    0% { transform: translateY(-14px) scale(0.97); opacity: 0; }
    40% { opacity: 1; }
    70% { transform: translateY(2px) scale(1.015); }
    100% { transform: translateY(0) scale(1); }
}

.lk-lock-open {
    width: 100%;

    :deep(svg) {
        width: 100%;
        height: auto;
        display: block;
        overflow: visible;
        filter: drop-shadow(0 12px 20px rgba(7, 102, 229, 0.3));
    }

    :deep(#Arco) {
        transform-box: fill-box;
        transform-origin: 9% 52%;
    }
}

// Unlocking (decrypt success): the open artwork fades in over the closed one
// while the shackle springs open (from a near-closed pose up and out).
.lk-lock-unlocking .lk-lock-open {
    animation: lockSwapIn 0.35s ease-out both;
}

.lk-lock-unlocking :deep(#Arco) {
    animation: arcoUnlock 0.9s ease-in-out both;
}

@keyframes lockSwapIn {
    from { opacity: 0; }
    to { opacity: 1; }
}

@keyframes arcoUnlock {
    0% { transform: rotate(10deg); }
    68% { transform: rotate(-6deg); }
    100% { transform: rotate(0deg); }
}
</style>
