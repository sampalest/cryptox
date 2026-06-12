<template>
    <div ref="dropZone" class="pic-drag vertical-align-nc hidden"
        @drag.stop.prevent=""
        @dragover.stop.prevent=""
        @dragstart.stop.prevent="onDragStart"
        @dragenter.stop.prevent="onDragStart"
        @dragend.stop.prevent="onDragStop"
        @dragleave.stop.prevent="onDragStop"
        @drop.stop.prevent="onFileDrop">
        <img src="@/assets/files.svg" alt="PUT YOUR FILE HERE" class="drag-icon">
        <p>Put your files here</p>
    </div>
</template>

<script>
export default {
    name: "image-loader",
    emits: ["imageFile"],
    methods: {
        onDragStart() {
            this.$refs.dropZone.classList.remove("hidden");
        },
        onDragStop() {
            this.$refs.dropZone.classList.add("hidden");
        },
        onFileDrop(e) {
            this.$emit("imageFile", e.dataTransfer.files);
            this.$refs.dropZone.classList.add("hidden");
        }
    }
};
</script>
