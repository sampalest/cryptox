<template>
    <div class="lk-done">
        <div class="lk-done-title lk-title">{{ isDecrypt ? "File decrypted!" : "Files encrypted!" }}</div>
        <div v-if="outputLabel" class="lk-chip">
            <lk-icon name="file" :width="14" :height="16" aria-hidden="true" />
            <span>{{ outputLabel }}</span>
        </div>
        <div class="lk-done-badge" aria-hidden="true">
            <span class="lk-done-disc"></span>
            <lk-icon name="check-badge" class="lk-done-mark" :size="52" />
        </div>
        <div class="lk-done-body lk-sub">
            {{ isDecrypt ? "Saved next to the encrypted file. Nothing left the dino's jaws unlocked." : "Saved next to the originals. The original files were not modified." }}
        </div>
        <glass-button variant="glass" @click="$emit('done')">
            <lk-icon name="check" :size="15" aria-hidden="true" />
            Done
        </glass-button>
    </div>
</template>
<script>
import Constants from "@shared/constants.js";
import GlassButton from "@/components/ui/GlassButton.vue";
import LkIcon from "@/components/ui/LkIcon.vue";

export default {
    name: "success-screen",
    components: {
        "glass-button": GlassButton,
        "lk-icon": LkIcon
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
