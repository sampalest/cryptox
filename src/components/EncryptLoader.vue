<template>
    <div class="template-container">
        <div class="title-block">
            <div class="app-title">Encrypting...</div>
        </div>
        <div class="logo-block-encrypted zoomIn animated">
            <img src="@/assets/enc_file.svg" alt="Enc file">
        </div>
        <div class="progress block-progress">
            <div class="determinate" :style="{'width': percent + '%'}"></div>
        </div>
        <p class="progress-perc">{{percent}}%</p>
    </div>
</template>
<script>
import animation from "@/components/mixins/animation.js";
import fileop from "@/components/mixins/fileop.js";

export default {
    name: "encrypt-loader",
    data: () => {
        return {
            percent: 0
        };
    },
    mixins: [animation, fileop],
    props: ["files", "password"],
    watch: {
        finish() {
            setTimeout(()=> {
                this.$emit("finish", this.finish);
            }, 1500);
        }
    },
    mounted() {
        this.$nextTick(function () {
            this.encryptFiles();
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