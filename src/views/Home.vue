<template>
  <div class="home">
    <fileupload></fileupload>
    <router-link to='design'>Design</router-link>
    <br>
    <router-link to='config'>Config</router-link>
  </div>
</template>

<script>
import FileUpload from "@/components/FileUpload.vue";

export default {
    name: "Home",
    components: {
        "fileupload": FileUpload
    }
};
</script>
