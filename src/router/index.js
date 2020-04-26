import Vue from "vue";
import VueRouter from "vue-router";
import Home from "../views/Home.vue";
import Config from  "../views/Config.vue";

Vue.use(VueRouter);

const routes = [
    {
        path: "/",
        name: "Home",
        component: Home
    },
    {
        path: "/config",
        name: "Config",
        component: Config
    }
];

const router = new VueRouter({
    routes
});

export default router;
