<template>
  <div id="app" class="light">
    <div class="bg-navbar"></div>
    <div class="hide-navbar">{{appTitle}}</div>
    <div class="page-block">
      <router-view/>
    </div>
  </div>
</template>
<script>
export default {
    data: () => {
        return {
            appTitle: "CRYPTOX"
        };
    }
};
</script>
