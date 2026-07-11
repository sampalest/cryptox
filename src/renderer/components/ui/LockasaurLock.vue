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
