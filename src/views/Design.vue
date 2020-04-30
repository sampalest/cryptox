<template>
    <div>
		<encrypt-loader v-if="loader" :files="files" :password="password" @finish="loader=false"></encrypt-loader>
        <password-screen v-else-if="showPassword" @password="setPassword"></password-screen>
        <transition-group v-else id="animation-transition" appear @before-enter="beforeEnter" @enter="enter($event, 'fadeInUp')" tag="div">
            <div class="title-block" :key="0" :data-index="0">
                <div class="app-title">Cryptox</div>
                <div class="app-subtitle">Secure Everything</div>
            </div>
            <div class="logo-block" :key="3" :data-index="3">
                <img class="criptox-logo" src="@/assets/cryptox.svg" alt="Cryptox icon">
                <fileloader @imageFile="selectFile"></fileloader>
            </div>
            <div class="description-page row" :key="2" :data-index="2">
                <div class="col s12">Please, drag your files here or click in the button to encrypt.</div>
            </div>
            <div class="button-block" :key="1" :data-index="1">
                <a @click="$refs.fileInput.click()" class="file-button">Select Files</a>
            </div>
        </transition-group>
        <input ref="fileInput" type="file" class="hide" @change="inputFile" multiple>
    </div>
</template>
<script>
import animation from "@/components/mixins/animation.js";
import fileop from "@/components/mixins/fileop.js";
import FileLoader from "@/components/FileLoader.vue";
import PasswordScreen from "@/components/PasswordScreen.vue";
import EncryptLoader from "@/components/EncryptLoader.vue";

export default {
    name: "design",
    data: () => {
        return {
            showPassword: false,
            password: "",
            files: null,
            loader: false,
			error: false
        };
    },
    mixins: [animation, fileop],
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
            this.selectFile(e.target.files);
        },
        selectFile(files) {
            this.showPassword = true;
            this.files = files;
        }
    }
};
</script>
<style>
	.cryptox-logo {
		padding: 2em;
	}
</style>