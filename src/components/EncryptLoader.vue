<template>
    <div class="template-container">
        <div class="title-block">
            <div class="app-title">
                <span v-text="isEncrypt ? 'Encrypting...' : 'Decrypting...'"></span>
            </div>
        </div>
        <div class="logo-block-encrypted zoomIn animated">
            <img src="@/assets/enc_file.svg" alt="Enc file">
        </div>
        <div class="progress block-progress">
            <div class="determinate" :style="{'width': percent.value + '%'}"></div>
        </div>
        <p class="progress-perc">{{percent.value}}%</p>
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
            }
        };
    },
    mixins: [animation, fileCrypto],
    props: {
        files: {
            type: FileList,
            default: []
        },
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
            }, 1000);
        }
    },
    mounted() {
        this.$nextTick(function () {
            if (this.isEncrypt) {
                this.encryptFile();
            } else {
                this.decryptFile();
            }
        });
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