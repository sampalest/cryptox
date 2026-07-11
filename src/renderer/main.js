import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import { useWindowSizeStore } from "./store/windowSize";
import "./sass/main.scss";

const app = createApp(App).use(createPinia()).use(router);

// The saved window-size preset is reapplied before mount: the window only
// becomes visible after the app mounts (ready-to-show / files:renderer-ready),
// so awaiting here guarantees launch never flashes the default size. An async
// lifecycle hook could not (Vue does not await them). A failed reapply must
// never block mount: the main process falls back to its 2s show timer, and a
// blank window would be worse than a wrongly sized one.
useWindowSizeStore().init().catch(() => {}).then(() => app.mount("#root"));
