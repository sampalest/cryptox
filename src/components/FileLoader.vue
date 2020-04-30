<template>
    <div class="pic-drag vertical-align-nc hidden"
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
/* eslint-disable */

export default {
    name: "image-loader",
    data: () => {
        return {
            pic: null
        }
    },
    methods: {
        onDragStart: function (e) {            
            this.pic.classList.remove("hidden");
        },
        onDragStop: function (e) {
            this.pic.classList.add("hidden");
        },
        onFileDrop: function (e) {
            this.$emit('imageFile', e.dataTransfer.files);
            this.pic.classList.add("hidden");
        }
    },
    mounted: function () {
        this.$nextTick(() => {
            this.pic = document.querySelector(".pic-drag");
        });
    }
}
</script>
