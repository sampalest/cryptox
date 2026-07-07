import { createRouter, createWebHashHistory } from "vue-router";
import Home from  "../views/Home.vue";

const routes = [
    {
        path: "/",
        name: "home",
        component: Home
    },
    {
        // Hidden easter-egg page, reached by holding the Home dino for 5 s.
        // Lazy: keeps the page (and its roar audio reference) out of the
        // initial chunk; Home stays eager because it is the first paint.
        path: "/rawr",
        name: "rawr",
        component: () => import("../views/Rawr.vue")
    }
];

const router = createRouter({
    history: createWebHashHistory(),
    routes
});

export default router;
