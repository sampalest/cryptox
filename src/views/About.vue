<template>
    <div class="about">
        <div class="github" @click="goGithub" >
            <img src="@/assets/github_black.svg" alt="Github">
        </div>
        <transition-group id="animation-transition" appear @before-enter="beforeEnter" @enter="enter($event, 'fadeInUp')" tag="div">
            <div class="logo-block" :key="0" :data-index="0">
                <img class="cryptox-logo" src="@/assets/cryptox_app.svg" alt="Cryptox icon">
            </div>
            <div class="title-block" :key="1" :data-index="1">
                <div class="app-title">Cryptox</div>
                <div class="app-subtitle">Secure Everything</div>
            </div>
            <router-link to="/" :key="2" :data-index="2">
                <img class="go-back" src="@/assets/back-button.svg">
            </router-link>
        </transition-group>
        <div class="dev-title" v-text="'<> with ❤️ by Sam'"></div>
    </div>
</template>
<script>
import animation from "@/components/mixins/animation.js";
const { shell } = require("electron").remote;
export default {
    name: "about",
    mixins: [animation],
    methods: {
        goGithub() {
            shell.openExternal("https://github.com/Samuelpe/cryptox");
        }
    }
};
</script>