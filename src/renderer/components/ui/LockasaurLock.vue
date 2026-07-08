<template>
  <div
    class="lk-lock"
    :class="'lk-lock-' + lockState"
    :style="{ width: size + 'px', height: boxHeight + 'px' }"
    aria-hidden="true"
    v-html="svg"
  ></div>
</template>
<script>
// One artwork for every state: the SVG is inlined via ?raw + v-html (static
// build-time content) so CSS can reach the #Arco shackle group and pose it by
// a vertical translation alone. 0 is the open hook; dropping it straight down
// (see $closed-drop in the styles) sinks the arrow-tipped right leg behind the
// dino body so the loop reads shut. No image swap ever happens between states.
// In the current export the shackle is a raster <use> drawn behind the body;
// #Arco is the hand-added group wrapping it, and it must sit on a group with
// NO transform attribute (a CSS transform replaces the attribute instead of
// composing with it); the export's positioning matrix lives on the parent
// wrapper group. Re-exports of the asset must restore that structure.
import lockSvg from "@/assets/lockasaur-lock.svg?raw";

// The artwork fills its 1749x2325 viewBox.
const ASPECT = 2325 / 1749;

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
        boxHeight() {
            return Math.round(this.size * ASPECT);
        },
        svg() {
            return lockSvg;
        }
    }
};
</script>
<style lang="scss" scoped>
// The shackle pose for locked/locking: enough straight-down travel (in SVG
// user units, so it scales with the artwork; in the current export #Arco's
// units map 1:1 to viewBox units) that the open hook's right leg sinks
// behind the dino body and the loop reads closed.
$closed-drop: 180px;

.lk-lock {
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 0;

    :deep(svg) {
        width: 100%;
        height: auto;
        display: block;
        overflow: visible;
        filter: drop-shadow(0 12px 20px rgba(7, 102, 229, 0.3));
    }

}

.lk-lock-locked :deep(#Arco) {
    transform: translateY($closed-drop);
}

// Locking (encrypt success): the shackle drops down past the closed pose and
// settles shut with a soft overshoot.
.lk-lock-locking :deep(#Arco) {
    animation: arcoLock 0.9s ease-in-out both;
}

@keyframes arcoLock {
    0% { transform: translateY(0); }
    70% { transform: translateY($closed-drop + 25px); }
    100% { transform: translateY($closed-drop); }
}

// Unlocking (decrypt success): the shackle springs up from the closed pose.
.lk-lock-unlocking :deep(#Arco) {
    animation: arcoUnlock 0.9s ease-in-out both;
}

@keyframes arcoUnlock {
    0% { transform: translateY($closed-drop); }
    68% { transform: translateY(-34px); }
    100% { transform: translateY(0); }
}
</style>
