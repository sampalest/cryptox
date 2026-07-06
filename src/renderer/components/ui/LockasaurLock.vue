<template>
  <div
    class="lk-lock"
    :class="'lk-lock-' + lockState"
    :style="{ width: size + 'px' }"
    aria-hidden="true"
  >
    <img
      v-if="isClosed"
      class="lk-lock-closed"
      src="@/assets/lockasaur-closed.png"
      alt=""
      :style="{ width: size + 'px' }"
    >
    <div v-else class="lk-lock-open" v-html="lockSvg"></div>
  </div>
</template>
<script>
// Two artworks, one per state, so each looks right:
//  - closed/encrypt uses lockasaur-closed.png, which has a genuine STRAIGHT
//    shackle. The open SVG's shackle is an asymmetric open hook (short arrow-
//    tipped right leg), so no rotation can turn it into a straight closed loop.
//  - open/decrypt uses lockasaur-open.svg, whose #Arco shackle springs open.
import lockSvg from "@/assets/lockasaur-open.svg?raw";

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
        lockSvg() {
            return lockSvg;
        }
    }
};
</script>
<style lang="scss" scoped>
.lk-lock {
    display: block;
    line-height: 0;
}

.lk-lock-closed {
    display: block;
    height: auto;
    filter: drop-shadow(0 12px 20px rgba(7, 102, 229, 0.3));
}

// Encrypt: the closed lock drops in and settles with a click (a "thunk").
.lk-lock-locking .lk-lock-closed {
    transform-origin: 50% 35%;
    animation: lockThunk 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

@keyframes lockThunk {
    0% { transform: translateY(-12px) scale(0.9); }
    50% { transform: translateY(3px) scale(1.06); }
    72% { transform: translateY(0) scale(0.98); }
    100% { transform: translateY(0) scale(1); }
}

.lk-lock-open {
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

// Decrypt: the shackle springs open (from a near-closed pose up and out).
.lk-lock-unlocking :deep(#Arco) {
    animation: arcoUnlock 0.9s ease-in-out both;
}

@keyframes arcoUnlock {
    0% { transform: rotate(10deg); }
    68% { transform: rotate(-6deg); }
    100% { transform: rotate(0deg); }
}
</style>
