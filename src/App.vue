<template>
  <div id="app" class="light">
    <div class="bg-navbar"></div>
    <div class="hide-navbar">{{appTitle}}</div>
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
		tempFiles: "/tmp/cryptox",
		dockMenu: null,
		messages: {}
		};
	},
	async beforeMount() {
		const appInfo = await window.cryptox.app.getInfo();
		this.language = appInfo.locale.substring(0, 2);
		this.messages = { ...Messages[this.language] };
		this.tempFiles = appInfo.tempPath;
	}
};
</script>
