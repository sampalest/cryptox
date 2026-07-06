<template>
  <div class="lk-blobs" aria-hidden="true">
    <div class="lk-blob lk-blob-1"></div>
    <div class="lk-blob lk-blob-2"></div>
    <div class="lk-blob lk-blob-3"></div>
  </div>
</template>
<script>
export default {
    name: "BackgroundBlobs"
};
</script>
<style lang="scss" scoped>
.lk-blobs {
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    overflow: hidden;
}

.lk-blob {
    position: absolute;
    will-change: transform;
}

.lk-blob-1 {
    top: -110px;
    left: -90px;
    width: 380px;
    height: 380px;
    background: radial-gradient(circle at 38% 36%, rgba(47, 225, 229, 0.3), rgba(7, 102, 229, 0.05) 70%);
    filter: blur(32px);
    animation: blob 17s ease-in-out infinite;
}

.lk-blob-2 {
    bottom: -130px;
    right: -100px;
    width: 400px;
    height: 400px;
    background: radial-gradient(circle at 60% 42%, rgba(17, 208, 227, 0.24), rgba(7, 102, 229, 0.04) 70%);
    filter: blur(36px);
    animation: blob 22s ease-in-out infinite reverse;
}

.lk-blob-3 {
    top: 34%;
    left: 46%;
    width: 260px;
    height: 260px;
    background: radial-gradient(circle, rgba(127, 189, 255, 0.2), transparent 70%);
    filter: blur(32px);
    animation: blob 26s ease-in-out infinite;
}
</style>
