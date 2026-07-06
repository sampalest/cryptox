<template>
    <div class="lk-done">
        <div class="lk-done-title lk-title">{{ isDecrypt ? "File decrypted!" : "Files encrypted!" }}</div>
        <div v-if="outputLabel" class="lk-chip">
            <svg width="14" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"></path><path d="M14 3v5h5"></path></svg>
            <span>{{ outputLabel }}</span>
        </div>
        <div class="lk-done-badge" aria-hidden="true">
            <span class="lk-done-disc"></span>
            <svg class="lk-done-mark" viewBox="0 0 52 52">
                <path d="M15 27 l7.5 7.5 L38 18" fill="none" stroke="#fff" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"></path>
            </svg>
        </div>
        <div class="lk-done-body lk-sub">
            {{ isDecrypt ? "Saved next to the encrypted file. Nothing left the dino's jaws unlocked." : "Saved next to the originals. The original files were not modified." }}
        </div>
        <glass-button variant="glass" @click="$emit('done')">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>
            Done
        </glass-button>
    </div>
</template>
<script>
import Constants from "@shared/constants.js";
import GlassButton from "@/components/ui/GlassButton.vue";

export default {
    name: "success-screen",
    components: {
        "glass-button": GlassButton
    },
    emits: ["done"],
    props: {
        files: {
            type: Array,
            default: null
        },
        isDecrypt: {
            type: Boolean,
            default: true
        }
    },
    computed: {
        // Informational only: the real output can carry a " (n)" suffix from
        // collision handling, or (CTX1 decrypt) a header-derived name.
        outputLabel() {
            if (!this.files || !this.files.length) return "";
            if (this.files.length > 1) return `${this.files.length} files`;
            const name = this.files[0].name;
            if (this.isDecrypt) {
                const ext = Constants.ENCRYPTED_POINT_EXTS.find(e => name.endsWith(e));
                return ext ? name.slice(0, -ext.length) : name;
            }
            // Mirror the encrypt naming: the last extension is replaced, so
            // "notes.txt" becomes "notes.dino" (multi-dot stems keep the rest).
            const lastDot = name.lastIndexOf(".");
            const stem = lastDot > 0 ? name.slice(0, lastDot) : name;
            return stem + Constants.POINT_EXT;
        }
    }
};
</script>
<style lang="scss" scoped>
.lk-done {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 30px;
    text-align: center;
    animation: fadeScreen 0.62s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.lk-done-title {
    font-size: 23px;
}

.lk-done-badge {
    position: relative;
    width: 88px;
    height: 88px;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: successRing 0.5s ease both;
}

.lk-done-disc {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: linear-gradient(160deg, #5fd483, #2ea65f);
    /* Glassy top sheen so it reads with the rest of the design, not flat. */
    box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.45), 0 14px 30px rgba(46, 166, 95, 0.34);
}

.lk-done-mark {
    position: relative;
    width: 52px;
    height: 52px;
}

/* Crisp vector check that draws itself in. Base offset is 0 (fully visible),
   so it never disappears even if the draw animation does not run. */
.lk-done-mark path {
    stroke-dasharray: 36;
    animation: lkDrawCheck 0.55s cubic-bezier(0.65, 0, 0.45, 1) 0.25s both;
}

@keyframes lkDrawCheck {
    0% { stroke-dashoffset: 36; }
    100% { stroke-dashoffset: 0; }
}

.lk-done-body {
    max-width: 330px;
    line-height: 1.55;
}
</style>
