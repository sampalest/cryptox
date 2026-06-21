<template>
    <form @submit.prevent="checkPassword">
        <transition-group id="pass-transition" class="max-screen" appear @before-enter="beforeEnter" @enter="enter($event, 'fadeIn')" tag="div">
            <div class="title-block" :key="0" :data-index="0">
                <div class="app-title">Password</div>
                <div class="app-subtitle">Enter your password</div>
            </div>
                <div class="row" :key="1" :data-index="1">
                    <div class="input-field col s10 offset-s1">
                        <i class="material-icons prefix" aria-hidden="true">lock</i>
                        <input type="password" name="password" id="password" v-model="password"
                            :autocomplete="isDecrypt ? 'current-password' : 'new-password'"
                            autocapitalize="off" autocorrect="off" spellcheck="false">
                        <label for="password">Password</label>
                    </div>
                </div>
                <div v-if="!isDecrypt" class="row" :key="2" :data-index="2">
                    <div class="input-field col s10 offset-s1">
                        <i class="material-icons prefix" aria-hidden="true">lock</i>
                        <input type="password" name="newpassword" id="newpassword" v-model="newPassword"
                            autocomplete="new-password" autocapitalize="off" autocorrect="off" spellcheck="false">
                        <label for="newpassword">Retype Password</label>
                    </div>
                </div>
                <div class="button-block" :key="3" :data-index="3">
                    <button type="submit" class="waves-effect waves-light file-button">
                        <div class="vertical-align text-button">
                            <i class="material-icons left" aria-hidden="true" v-text="isDecrypt ? 'lock_outline' : 'lock_open'"></i>
                            <span>{{ isDecrypt ? 'Decrypt' : 'Encrypt' }}</span>
                        </div>
                    </button>
                </div>
                <div class="cancel-button" :key="4" :data-index="4">
                    <a role="button" tabindex="0" @click="$emit('cancel')" @keydown.enter.prevent="$emit('cancel')" @keydown.space.prevent="$emit('cancel')">Cancel</a>
                </div>
        </transition-group>
    </form>
</template>
<script>
import * as e from "@shared/exceptions.js";
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
    emits: ["password", "cancel", "setDecrypt"],
    props: {
        isDecrypt: {
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
                else if (this.password.length <= 4) {
                    throw new e.NoValidPassword("This password is too short. Please, choose another one.");
                }
                else if (this.isDecrypt) {
                    this.emitObject();
                    return;
                }
                else if (this.password !== this.newPassword) {
                    throw new e.NoValidPassword("Passwords don't match.");
                }

                this.emitObject();

            } catch (error) {
                this.password = "";
                this.newPassword = "";
                alert(error.message);
            }
        },
        emitObject() {
            this.$emit("setDecrypt", this.isDecrypt);
            this.$emit("password", this.password);
            // Clear the plaintext password on the success path too. JS strings
            // are immutable, so this is best-effort hygiene (no real zeroing),
            // matching the error path above.
            this.password = "";
            this.newPassword = "";
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
