import { createRouter, createWebHashHistory } from "vue-router";
import Home from  "../views/Home.vue";
import Rawr from "../views/Rawr.vue";

const routes = [
    {
        path: "/",
        name: "home",
        component: Home
    },
    {
        // Hidden easter-egg page, reached by holding the Home dino for 5 s.
        path: "/rawr",
        name: "rawr",
        component: Rawr
    }
];

const router = createRouter({
    history: createWebHashHistory(),
    routes
});

export default router;
