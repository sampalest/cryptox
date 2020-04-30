import Vue from "vue";
import VueRouter from "vue-router";
import Home from "../views/Home.vue";
import Config from  "../views/Config.vue";
import Design from  "../views/Design.vue";

Vue.use(VueRouter);

const routes = [
    {
        path: "/",
        name: "Design",
        component: Design
    },
    {
        path: "/config",
        name: "Config",
        component: Config
    },
    {
        path: "/home",
        name: "Home",
        component: Home
    }
];

const router = new VueRouter({
    routes
});

export default router;
