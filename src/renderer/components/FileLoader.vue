<template>
    <div ref="dropZone" class="lk-drop vertical-align-nc hidden" aria-hidden="true">
        <svg class="lk-drop-icon" width="56" height="56" viewBox="0 0 24 24" fill="var(--surface2)" stroke="var(--accent)" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true">
            <path d="M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z"></path>
            <path d="M13 3v6h6" fill="none"></path>
            <line x1="9" y1="13" x2="15" y2="13" stroke-linecap="round"></line>
            <line x1="9" y1="16.5" x2="15" y2="16.5" stroke-linecap="round"></line>
        </svg>
        <p class="lk-drop-text">Drop your files here</p>
        <p class="lk-drop-sub">The dino locks them up tight.</p>
    </div>
</template>

<script>
// Drag detection lives on window (not on the overlay) so the overlay can be
// pointer-events:none and never intercept clicks meant for the dino behind it.
// A drag-depth counter keeps it shown while the cursor moves across child
// elements, hiding only when the file drag actually leaves the window.
export default {
    name: "image-loader",
    emits: ["imageFile"],
    data: () => ({
        dragDepth: 0
    }),
    methods: {
        hasFiles(e) {
            return Boolean(e.dataTransfer) && Array.from(e.dataTransfer.types || []).includes("Files");
        },
        show() {
            this.$refs.dropZone.classList.remove("hidden");
        },
        hide() {
            this.dragDepth = 0;
            this.$refs.dropZone.classList.add("hidden");
        },
        onDragEnter(e) {
            if (!this.hasFiles(e)) return;
            e.preventDefault();
            this.dragDepth++;
            this.show();
        },
        onDragOver(e) {
            if (this.hasFiles(e)) e.preventDefault();
        },
        onDragLeave(e) {
            if (!this.hasFiles(e)) return;
            this.dragDepth = Math.max(0, this.dragDepth - 1);
            if (this.dragDepth === 0) this.$refs.dropZone.classList.add("hidden");
        },
        onDrop(e) {
            e.preventDefault();
            this.hide();
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
                this.$emit("imageFile", e.dataTransfer.files);
            }
        }
    },
    mounted() {
        window.addEventListener("dragenter", this.onDragEnter);
        window.addEventListener("dragover", this.onDragOver);
        window.addEventListener("dragleave", this.onDragLeave);
        window.addEventListener("drop", this.onDrop);
    },
    beforeUnmount() {
        window.removeEventListener("dragenter", this.onDragEnter);
        window.removeEventListener("dragover", this.onDragOver);
        window.removeEventListener("dragleave", this.onDragLeave);
        window.removeEventListener("drop", this.onDrop);
    }
};
</script>
<style lang="scss" scoped>
/* Visual only (pointer-events:none) so clicks fall through to the dino behind;
   revealed by the window-level drag listeners above. */
.lk-drop {
    width: min(88vw, 640px);
    height: min(54vh, 340px);
    position: absolute;
    margin: auto;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 999;
    gap: 6px;
    pointer-events: none;
    border-radius: 28px;
    /* Crystal glass: a more transparent surface with a diagonal light sheen on
       top, a stronger blur/saturation, and a rim highlight plus inner glow so
       the panel catches light like polished glass floating over the content. */
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0.04) 62%), var(--surface);
    backdrop-filter: saturate(1.9) blur(30px);
    -webkit-backdrop-filter: saturate(1.9) blur(30px);
    border: 1px solid var(--glass-edge);
    box-shadow: inset 0 1px 0 var(--glass-edge), inset 0 -1px 0 rgba(255, 255, 255, 0.16), inset 0 0 44px rgba(255, 255, 255, 0.1), var(--dialog-shadow);
    opacity: 1;
    transition: opacity 0.25s ease-in-out;

    &.hidden {
        opacity: 0;
    }
}

.lk-drop-icon {
    pointer-events: none;
    animation: floatSoft 3.6s ease-in-out infinite;
    filter: drop-shadow(0 6px 12px rgba(7, 102, 229, 0.18));
}

.lk-drop-text {
    font-family: Montserrat, sans-serif;
    font-size: 32px;
    font-weight: 600;
    margin: 14px 0 0;
    color: var(--text);
    pointer-events: none;
}

.lk-drop-sub {
    font-size: 14.5px;
    margin: 5px 0 0;
    color: var(--faint);
    pointer-events: none;
}
</style>
