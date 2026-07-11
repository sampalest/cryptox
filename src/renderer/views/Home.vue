<template>
    <div class="home-screen">
        <encrypt-loader v-if="loader" :files="files" :password="password" :expiration="expiration" :is-decrypt="encrypted" @finish="operationFinished" @cancel="finishOperation"></encrypt-loader>
        <success-screen v-else-if="success" :files="files" :is-decrypt="encrypted" @done="finishOperation"></success-screen>
        <password-screen v-else-if="showPassword" :is-decrypt="encrypted" :files="files" @password="setPassword" @expiration="expiration = $event" @cancel="cancelPassword" @setDecrypt="setDecrypt"></password-screen>
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
                <glass-button ref="select" variant="primary" :title="isMac ? 'Select files or folders' : null" @click="onOpen()">
                    <lk-icon v-if="isMac" name="wand" :size="16" />
                    <lk-icon v-else name="files" :size="16" />
                    {{ isMac ? "Feed the Dino" : "Select Files" }}
                </glass-button>
                <glass-button v-if="!isMac" variant="glass" @click="onOpen('folder')">
                    <lk-icon name="folder-open" :size="16" />
                    Select Folder
                </glass-button>
            </div>
        </div>
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
import LkIcon from "@/components/ui/LkIcon.vue";
import { useAppStore } from "@/store/app";
import { useFilesStore } from "@/store/files.js";
import { useToastStore } from "@/store/toasts";
import { useUiStore } from "@/store/ui";

export default {
    name: "home-view",
    setup() {
        return { appStore: useAppStore(), ui: useUiStore() };
    },
    data: () => {
        return {
            showPassword: false,
            encrypted: true,
            password: "",
            expiration: null,
            files: null,
            loader: false,
            success: false,
            error: false
        };
    },
    computed: {
        isMac() {
            return this.appStore.isMac;
        }
    },
    mixins: [sysevents],
    components: {
        "fileloader": FileLoader,
        "password-screen": PasswordScreen,
        "encrypt-loader": EncryptLoader,
        "success-screen": SuccessScreen,
        "glass-button": GlassButton,
        "word-mark": WordMark,
        "dino-logo": DinoLogo,
        "lk-icon": LkIcon
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
        async selectFile(files) {
            let ctx = 0;
            this.files = await Promise.all(Array.from(files).map(async file => {
                if (file.path) return file;
                // Dropped DOM File objects only yield a path; the directory
                // flag (chip icon) comes from the bridge.
                const filePath = window.lockasaur.files.getPathForFile(file);
                const isDirectory = await window.lockasaur.files.isDirectory(filePath);
                return new FileManager(filePath, isDirectory);
            }));
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
                useToastStore().warning("Cannot mix encrypted and unencrypted files.");
                return;
            }

            this.showPassword = true;
        },
        // A finished operation shows the success screen (files kept for the
        // output chip); cancel and Done reset straight to the home screen.
        operationFinished() {
            this.loader = false;
            this.password = "";
            this.expiration = null;
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
            this.expiration = null;
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
    async beforeMount() {
        const filesStore = useFilesStore();
        const path = filesStore.files;
        if (path) this.selectFile([new FileManager(path, await window.lockasaur.files.isDirectory(path))]);
        filesStore.clearFiles();

        // macOS is the only platform whose native dialog picks files and
        // folders at once, so it gets one merged button; Windows and Linux
        // keep the separate Select Folder button. The app store's isMac stays
        // false while app info is in flight, so both buttons keep working.
        await this.appStore.load();
    }
};
</script>
