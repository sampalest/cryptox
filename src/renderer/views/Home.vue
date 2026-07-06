<template>
    <div class="home-screen">
        <encrypt-loader v-if="loader" :files="files" :password="password" :is-decrypt="encrypted" @finish="operationFinished" @cancel="finishOperation"></encrypt-loader>
        <success-screen v-else-if="success" :files="files" :is-decrypt="encrypted" @done="finishOperation"></success-screen>
        <password-screen v-else-if="showPassword" :is-decrypt="encrypted" :files="files" @password="setPassword" @cancel="cancelPassword" @setDecrypt="setDecrypt"></password-screen>
        <div v-else class="lk-home">
            <div class="lk-home-head">
                <word-mark :size="46" animate />
                <div class="lk-home-tagline">Encryption with <span class="lk-home-bite">bite.</span></div>
            </div>
            <div class="lk-home-logo">
                <dino-logo :size="280"
                    @hold-start="ui.startBinaryRain()"
                    @hold-cancel="ui.stopBinaryRain()"
                    @hold-complete="enterRawr" />
                <fileloader @imageFile="selectFile"></fileloader>
            </div>
            <div class="lk-home-hint">Drop your files here, or let the dino fetch them.</div>
            <div class="lk-home-actions">
                <glass-button ref="select" variant="primary" @click="$refs.fileInput.click()">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"></path></svg>
                    Select Files
                </glass-button>
            </div>
        </div>
        <input ref="fileInput" type="file" class="hide" @change="inputFile" multiple>
    </div>
</template>
<script>
import Constants from "@shared/constants.js";
import sysevents from "@/components/mixins/sysevents.js";
import FileLoader from "@/components/FileLoader.vue";
import FileManager from "@shared/filemanager.js";
import PasswordScreen from "@/components/PasswordScreen.vue";
import EncryptLoader from "@/components/EncryptLoader.vue";
import SuccessScreen from "@/components/SuccessScreen.vue";
import GlassButton from "@/components/ui/GlassButton.vue";
import WordMark from "@/components/ui/Wordmark.vue";
import DinoLogo from "@/components/ui/DinoLogo.vue";
import { useFilesStore } from "@/store/files.js";
import { useUiStore } from "@/store/ui";

export default {
    name: "home-view",
    setup() {
        return { ui: useUiStore() };
    },
    data: () => {
        return {
            showPassword: false,
            encrypted: true,
            password: "",
            files: null,
            loader: false,
            success: false,
            error: false
        };
    },
    mixins: [sysevents],
    components: {
        "fileloader": FileLoader,
        "password-screen": PasswordScreen,
        "encrypt-loader": EncryptLoader,
        "success-screen": SuccessScreen,
        "glass-button": GlassButton,
        "word-mark": WordMark,
        "dino-logo": DinoLogo
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
            let ctx = 0;
            this.files = Array.from(files).map(file => {
                if (file.path) return file;
                const filePath = window.cryptox.files.getPathForFile(file);
                return new FileManager(filePath);
            });
            this.files.forEach(file => {
                if (Constants.ENCRYPTED_POINT_EXTS.some(ext => file.name.endsWith(ext))) {
                    this.encrypted = true;
                    ctx++;
                } else {
                    this.encrypted = false;
                }
            });

            if (ctx > 0 && ctx != this.files.length) {
                this.files = null;
                alert("Cannot mix encrypted and unencrypted files.");
                return;
            }

            this.showPassword = true;
        },
        // A finished operation shows the success screen (files kept for the
        // output chip); cancel and Done reset straight to the home screen.
        operationFinished() {
            this.loader = false;
            this.password = "";
            this.success = true;
        },
        finishOperation() {
            this.loader = false;
            this.success = false;
            this.cancelPassword();
        },
        cancelPassword() {
            this.showPassword = false;
            this.password = "";
            this.files = null;
        },
        setDecrypt(bool) {
            this.encrypted = bool;
        },
        enterRawr() {
            this.ui.stopBinaryRain();
            this.$router.push({ name: "rawr" });
        }
    },
    beforeMount() {
        const filesStore = useFilesStore();
        const path = filesStore.files;
        if (path) this.selectFile([new FileManager(path)]);
        filesStore.clearFiles();
    }
};
</script>
<style lang="scss" scoped>
.lk-home {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 8px 26px 16px;
    text-align: center;
    animation: fadeScreen 0.62s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.lk-home-head {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
}

.lk-home-tagline {
    font-family: Montserrat, sans-serif;
    font-size: 16px;
    font-weight: 500;
    color: var(--dim);
    letter-spacing: 0.3px;
    white-space: nowrap;
    animation: fadeUp 0.55s ease 0.8s both;
}

.lk-home-bite {
    display: inline-block;
    color: #0766e5;
    font-weight: 700;
    transform-origin: 50% 80%;
    animation: bitePulse 1.8s ease-in-out 2 both;
    animation-delay: 1.2s;
}

.lk-home-logo {
    position: relative;
}

.lk-home-hint {
    font-size: 15px;
    color: var(--faint);
    animation: fadeUp 0.5s ease 0.9s both;
}

.lk-home-actions {
    display: flex;
    gap: 14px;
    animation: fadeUp 0.5s ease 1s both;
}
</style>
