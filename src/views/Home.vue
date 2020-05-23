<template>
    <div>
		<encrypt-loader v-if="loader" :files="files" :password="password" :isEncrypt="encrypted" @finish="finishOperation" @cancel="finishOperation"></encrypt-loader>
        <password-screen v-else-if="showPassword" :isEncrypt="encrypted" @password="setPassword" @cancel="cancelPassword" @setEncrypt="setEncrypt"></password-screen>
        <transition-group v-else id="animation-transition" appear @before-enter="beforeEnter" @enter="enter($event, 'fadeInUp')" tag="div">
            <div class="title-block" :key="0" :data-index="0">
                <div class="app-title">Cryptox</div>
                <div class="app-subtitle">Secure Everything</div>
            </div>
            <div class="logo-block" :key="3" :data-index="3" @click="animateLogo">
                <img ref="logo" class="cryptox-logo" src="@/assets/cryptox.svg" alt="Cryptox icon">
                <fileloader @imageFile="selectFile"></fileloader>
            </div>
            <div class="description-page row" :key="2" :data-index="2">
                <div class="col s12">Please, drag your files here or click in the button.</div>
            </div>
            <div class="button-block" :key="1" :data-index="1">
                <a ref="select" @click="$refs.fileInput.click()" class="file-button">Select Files</a>
            </div>
        </transition-group>
        <input ref="fileInput" type="file" class="hide" @change="inputFile" multiple>
    </div>
</template>
<script>
import Constants from "@/constants.js";
import animation from "@/components/mixins/animation.js";
import sysevents from "@/components/mixins/sysevents.js";
import FileLoader from "@/components/FileLoader.vue";
import PasswordScreen from "@/components/PasswordScreen.vue";
import EncryptLoader from "@/components/EncryptLoader.vue";

export default {
    name: "home",
    data: () => {
        return {
            showPassword: false,
            encrypted: true,
            password: "",
            files: null,
            loader: false,
            error: false,
            animationSTO: null
        };
    },
    mixins: [animation, sysevents],
    components: {
        "fileloader": FileLoader,
        "password-screen": PasswordScreen,
        "encrypt-loader": EncryptLoader
    },
    watch: {
        password() {
            if (this.password != "") {
                this.loader = true;
            }
        },
        error() {
            this.password = "";
            this.loader = false;
            this.showPassword = false;
        }
    },
    methods: {
        setPassword(password) {
            this.password = password;
            this.showPassword = false;
        },
        inputFile(e) {
            console.log(e.target.files);
            this.selectFile(e.target.files);
        },
        selectFile(files) {
            let ctx = 0;
            this.files = files;
            this.files.forEach(file => {
                let filesplit = file.name.split(".");
                if (filesplit && filesplit[1] === Constants.EXT) {
                    this.encrypted = true;
                    ctx++;
                } else {
                    this.encrypted = false;
                }
            });

            if (ctx > 0 && ctx != this.files.length) {
                alert("Cannot mixing encrypted and decrypted files.");
                return;
            }

            this.showPassword = true;
        },
        finishOperation() {
            this.loader = false;
            this.cancelPassword();
        },
        cancelPassword() {
            this.showPassword = false;
            this.password = "";
            this.files = null;
        },
        setEncrypt(bool) {
            this.encrypted = bool;
        },
        animateLogo() {
            const ANIMATION_SECONDS = 2300;
            this.$refs.logo.classList.add("bounce-in-fwd");
            if (this.animationSTO != null) {
                clearTimeout(this.animationSTO);
            }

            this.animationSTO = setTimeout(() => {
                this.$refs.logo.classList.remove("bounce-in-fwd");
            }, ANIMATION_SECONDS);
        }
    }
};
</script>