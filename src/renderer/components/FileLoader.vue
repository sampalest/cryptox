<template>
    <!-- Teleported to #app so the drop blur (master.scss, all platforms) can
         filter the titlebar, blobs and page content without ever filtering
         the drop zone itself: a CSS filter on any ancestor would blur it.
         defer is required: on initial mount the app tree is built detached,
         so without it the #app lookup fails and the drop zone never renders. -->
    <Teleport defer to="#app">
    <div ref="dropZone" class="lk-drop vertical-align-nc hidden" aria-hidden="true">
        <lk-icon name="file-drop" class="lk-drop-icon" :size="56" aria-hidden="true" />
        <p class="lk-drop-text">Drop your files here</p>
        <p class="lk-drop-sub">The dino locks them up tight.</p>
    </div>
    </Teleport>
</template>

<script>
// Drag detection lives on window (not on the overlay) so the overlay can be
// pointer-events:none and never intercept clicks meant for the dino behind it.
// A drag-depth counter keeps it shown while the cursor moves across child
// elements, hiding only when the file drag actually leaves the window.
import { useUiStore } from "@/store/ui";
import LkIcon from "@/components/ui/LkIcon.vue";

export default {
    name: "image-loader",
    components: {
        "lk-icon": LkIcon
    },
    emits: ["imageFile"],
    setup() {
        return { ui: useUiStore() };
    },
    data: () => ({
        dragDepth: 0
    }),
    methods: {
        hasFiles(e) {
            return Boolean(e.dataTransfer) && Array.from(e.dataTransfer.types || []).includes("Files");
        },
        show() {
            this.$refs.dropZone.classList.remove("hidden");
            this.ui.showDrop();
        },
        hide() {
            this.dragDepth = 0;
            this.$refs.dropZone.classList.add("hidden");
            this.ui.hideDrop();
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
            if (this.dragDepth === 0) this.hide();
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
        this.ui.hideDrop();
    }
};
</script>
