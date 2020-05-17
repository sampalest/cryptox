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
const { app } = require("electron").remote;
import Messages from "@/messages.js";

export default {
    data: () => {
        return {
            appTitle: "CRYPTOX",
            language: "en",
            tempFiles: "/tmp/cryptox",
            dockMenu: null,
            messages: {}
        };
    },
    beforeMount() {
      this.language = app.getLocale().substring(0, 2);
      this.messages = {...Messages[this.language]};
      // process.argv.forEach(ev => {console.log(ev);});
      app.on("open-file", ev => {console.log(ev);});
      app.on("open-url", ev => {console.log(ev);});
    }
};
</script>
