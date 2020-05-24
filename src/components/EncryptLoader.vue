<template>
    <div class="template-container">
        <div class="title-block">
            <div class="app-title">
                <span v-text="!isEncrypt ? 'Encrypting' : 'Decrypting'"></span>
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
            <a @click="cancel">Cancel</a>
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
            STOcancel: null
        };
    },
    mixins: [animation, fileCrypto],
    props: {
        files: {},
        password: {
            type: String,
            default: ""
        },
        isEncrypt: {
            type: Boolean,
            default: true
        }
    },
    watch: {
        finish() {
            setTimeout(()=> {
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
            this.$emit("cancel", true);
        }
    },
    beforeMount() {
        this.fileEvent.error = false;
    },
    mounted() {
        this.$nextTick(function () {
            if (!this.files.length) this.destroy();
            this.files.forEach(file => {
                if (this.isEncrypt) {
                    this.decryptFile(file);
                } else {
                    this.encryptFile(file);
                }
            });
        });

        this.STOcancel = setTimeout(() => {
            if (this.percent.value === 0 && !this.fileEvent.loader) {
                this.cancel();
            }
        }, 5000);
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