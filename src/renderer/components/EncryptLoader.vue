<template>
    <div class="template-container">
        <div class="title-block">
            <div class="app-title">
                <span v-text="isDecrypt ? 'Decrypting' : 'Encrypting'"></span>
            </div>
            <p>{{fileEvent.msg}} {{fileEvent.filename}}</p>
        </div>
        <div class="logo-block-encrypted zoomIn animated">
            <img src="@/assets/enc_file.svg" alt="Enc file">
        </div>
        <div class="progress block-progress">
            <div v-if="!fileEvent.loader" class="determinate" :style="{'width': percent.value + '%'}"></div>
            <div v-else class="indeterminate"></div>
        </div>
        <p v-if="!fileEvent.loader" class="progress-perc">{{percent.value}}%</p>
        <div class="cancel-button">
            <a role="button" tabindex="0" @click="cancel" @keydown.enter.prevent="cancel" @keydown.space.prevent="cancel">Cancel</a>
        </div>
    </div>
</template>
<script>
import animation from "@/components/mixins/animation.js";
import fileCrypto from "@/components/mixins/filecryto.js";

export default {
    name: "encrypt-loader",
    data: () => {
        return {
            percent: {
                value: 0
            },
            fileEvent: {
                error: false,
                loader: false,
                length: 1,
                counter: 0,
                progress: 0,
                total: 0,
                msg: "",
                filename: ""
            },
            finishSTO: null
        };
    },
    mixins: [animation, fileCrypto],
    emits: ["finish", "cancel"],
    props: {
        files: {
            type: Array,
            required: true
        },
        password: {
            type: String,
            default: ""
        },
        isDecrypt: {
            type: Boolean,
            default: true
        }
    },
    watch: {
        finish() {
            this.finishSTO = setTimeout(()=> {
                this.$emit("finish", this.finish);
            }, 500);
        },
        fileEvent: {
            deep: true,
            handler() {
                if (this.fileEvent.error) {
                    alert("Cannot decrypt file...");
                    this.cancel();
                }
            }
        }
    },
    methods: {
        cancel() {
            this.cancelOperations();
            this.$emit("cancel", true);
        },
        destroy() {
            this.cancel();
        }
    },
    beforeMount() {
        this.fileEvent.error = false;
    },
    mounted() {
        this.$nextTick(function () {
            if (!this.files.length) this.destroy();
            this.files.forEach(file => {
                if (this.isDecrypt) {
                    this.decryptFile(file);
                } else {
                    this.encryptFile(file);
                }
            });
        });
    },
    beforeUnmount() {
        // The component can unmount before in-flight operations settle (cancel,
        // navigate, fast finish). Clear the pending finish emit and release any
        // crypto:progress/crypto:status listeners so they never write to a
        // torn-down instance.
        clearTimeout(this.finishSTO);
        this.releaseAllHandlers();
    }
};
</script>
<style>
    .block-progress {
        margin: 2em 0 !important;
    }

    .determinate {
        background-color: #2087bd !important;
    }

    .progress-perc {
        font-size: 1.5em;
    }
</style>
