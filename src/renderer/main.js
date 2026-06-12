import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import "./sass/main.scss";
import "materialize-css/dist/js/materialize.min.js";
import "animate.css/animate.css";

createApp(App)
    .use(createPinia())
    .use(router)
    .mount("#app");
