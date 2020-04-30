import Vue from "vue";
import App from "./App.vue";
import router from "./router";
import store from "./store";
import "./sass/main.scss";
import "materialize-css/dist/js/materialize.min.js";
import "animate.css/animate.css";

Vue.config.productionTip = false;

new Vue({
    router,
    store,
    render: h => h(App)
}).$mount("#app");
