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
import Messages from "@/messages.js";

export default {
    data: () => {
        return {
            appTitle: "CRYPTOX",
            language: "en",
            dockMenu: null,
            isMac: false,
            messages: {}
        };
    },
    async beforeMount() {
        const appInfo = await window.cryptox.app.getInfo();
        this.language = appInfo.locale.substring(0, 2);
        this.isMac = appInfo.platform === "darwin";
        this.messages = { ...Messages[this.language] };
    }
};
</script>
