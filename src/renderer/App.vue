<template>
  <div id="app" :class="['light', { 'platform-darwin': isMac }]">
    <div v-if="isMac" class="bg-navbar"></div>
    <div v-if="isMac" class="hide-navbar">{{appTitle}}</div>
    <div class="page-block">
      <router-view />
    </div>
  </div>
</template>
<script>
export default {
    data: () => {
        return {
            appTitle: "CRYPTOX",
            dockMenu: null,
            isMac: false
        };
    },
    async beforeMount() {
        // The draggable custom navbar pairs with the macOS "hiddenInset" title
        // bar; on Windows/Linux the native title bar stands, so render neither
        // div to avoid a doubled title bar.
        const appInfo = await window.cryptox.app.getInfo();
        this.isMac = appInfo.platform === "darwin";
    }
};
</script>
