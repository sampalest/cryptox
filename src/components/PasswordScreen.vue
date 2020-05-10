<template>
    <form @submit.prevent="checkPassword">
        <transition-group id="pass-transition" class="max-screen" appear @before-enter="beforeEnter" @enter="enter($event, 'fadeIn')" tag="div">
            <div class="title-block" :key="0" :data-index="0">
                <div class="app-title">Password</div>
                <div class="app-subtitle">Enter your password</div>
            </div>
                <div class="row" :key="1" :data-index="1">
                    <div class="input-field col s10 offset-s1">
                        <i class="material-icons prefix">lock</i>
                        <input type="password" name="password" id="password" v-model="password">
                        <label for="password">Password</label>
                    </div>
                </div>
                <div v-if="isEncrypt" class="row" :key="2" :data-index="2">
                    <div class="input-field col s10 offset-s1">
                        <i class="material-icons prefix">lock</i>
                        <input type="password" name="newpassword" id="newpassword" v-model="newPassword">
                        <label for="newpassword">Retype Password</label>
                    </div>
                </div>
                <div class="button-block" :key="3" :data-index="3">
                    <button type="submit" class="waves-effect waves-light file-button">
                        <div class="vertical-align text-button">
                            <i class="material-icons left" v-text="isEncrypt ? 'lock_outline' : 'lock_open'"></i>
                            <span v-html="isEncrypt ? 'Encrypt' : 'Decrypt'"></span>
                        </div>
                    </button>
                </div>
                <div class="cancel-button" :key="4" :data-index="4">
                    <a @click="$emit('cancel')">Cancel</a>
                </div>
        </transition-group>
    </form>
</template>
<script>
import * as e from "../exceptions.js";
import animation from "@/components/mixins/animation.js";

export default {
    name: "password-screen",
    data: () => {
        return {
            password: "",
            newPassword: ""
        };
    },
    mixins: [animation],
    props: {
        isEncrypt: {
            type: Boolean,
            default: true
        }
    },
    methods: {
        checkPassword() {
            try {
                if (!this.password) {
                    throw new e.NoValidPassword("This password is empty O_o");
                }
                else if (!this.isEncrypt) {
                    this.goToDecrypt();
                }
                else if (this.password.length <= 4) {
                    throw new e.NoValidPassword("This password is too short. Please, choose another one.");
                }
                else if (this.password !== this.newPassword) {
                    throw new e.NoValidPassword("Passwords don't match.");
                }

                this.$emit("password", this.password);

            } catch (error) {
                this.password = "";
                this.newPassword = "";
                alert(error.message);
            }
        },
        goToDecrypt() {
            this.$emit("isEncrypt", this.encrypt);
            this.$emit("password", this.password);
        }
    }
};
</script>
<style>
    .max-screen {
        min-width: 70vw;
    }

    #password, #newpassword {
        font-size: 1.5em;
    }
</style>
