<template>
    <div class="lk-work">
        <div class="lk-title">{{ isDecrypt ? "Lockasaur Open" : "Encrypting..." }}</div>
        <div class="lk-chip">
            <span>{{ fileEvent.msg }} {{ fileEvent.filename }}</span>
        </div>
        <div class="lk-work-scene">
            <div class="lk-work-glow" aria-hidden="true"></div>
            <div class="lk-work-bits" aria-hidden="true">
                <span v-for="(bit, index) in bits" :key="index" class="lk-work-bit" :style="bit.style">{{ bit.char }}</span>
            </div>
            <lockasaur-lock class="lk-work-lock" :size="150" :lock-state="isDecrypt ? 'unlocking' : 'locking'" />
        </div>
        <div class="lk-work-track">
            <div class="lk-work-bar" :style="{ width: (fileEvent.loader ? 100 : percent.value) + '%' }"></div>
        </div>
        <div class="lk-work-meta">
            <div v-if="!fileEvent.loader" class="lk-work-perc">{{ percent.value }}%</div>
            <div class="lk-work-caption">AES-256 · 100% dino-approved</div>
        </div>
        <glass-button variant="glass" @click="cancel">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
            Cancel
        </glass-button>
    </div>
</template>
<script>
import fileCrypto from "@/components/mixins/filecryto.js";
import GlassButton from "@/components/ui/GlassButton.vue";
import LockasaurLock from "@/components/ui/LockasaurLock.vue";

// Floating binary digits around the lock, from the design mock.
const BITS = [
    { char: "1", left: 8, top: 108, size: 14, color: "#0766e5", delay: 0 },
    { char: "0", left: 34, top: 116, size: 13, color: "#11d0e3", delay: 0.32 },
    { char: "1", left: 60, top: 104, size: 15, color: "#0285e3", delay: 0.66 },
    { char: "0", left: 84, top: 118, size: 13, color: "#0766e5", delay: 1 },
    { char: "1", left: 112, top: 106, size: 14, color: "#11d0e3", delay: 0.5 },
    { char: "0", left: 138, top: 114, size: 13, color: "#0285e3", delay: 0.85 },
    { char: "1", left: 50, top: 100, size: 12, color: "#2ea65f", delay: 1.3 },
    { char: "0", left: 126, top: 120, size: 12, color: "#0766e5", delay: 0.18 }
];

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
    mixins: [fileCrypto],
    components: {
        "glass-button": GlassButton,
        "lockasaur-lock": LockasaurLock
    },
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
    computed: {
        bits() {
            return BITS.map(bit => ({
                char: bit.char,
                style: {
                    left: bit.left + "px",
                    top: bit.top + "px",
                    fontSize: bit.size + "px",
                    color: bit.color,
                    animationDelay: bit.delay + "s"
                }
            }));
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
<style lang="scss" scoped>
.lk-work {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 20px;
    padding: 30px;
    text-align: center;
    animation: fadeScreen 0.62s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.lk-work-scene {
    position: relative;
    width: 210px;
    height: 190px;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: zoomPop 0.45s ease both;
}

.lk-work-glow {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 150px;
    height: 150px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(47, 225, 229, 0.42), transparent 64%);
    animation: lockGlow 1.9s ease-in-out infinite;
    pointer-events: none;
}

.lk-work-bits {
    position: absolute;
    left: 50%;
    bottom: 6px;
    width: 160px;
    height: 140px;
    margin-left: -80px;
    pointer-events: none;
    z-index: 3;
    font-family: monospace;
    font-weight: 700;
}

.lk-work-bit {
    position: absolute;
    animation: nomFloat 1.7s ease-in infinite;
}

.lk-work-lock {
    position: relative;
    z-index: 2;
    animation: dinoMunch 2.4s ease-in-out infinite;
    transform-origin: 50% 70%;
}

.lk-work-track {
    width: 320px;
    height: 9px;
    background: var(--track);
    border-radius: 999px;
    overflow: hidden;
}

.lk-work-bar {
    height: 100%;
    background: linear-gradient(90deg, rgba(255, 255, 255, 0) 0, rgba(255, 255, 255, 0.55) 50%, rgba(255, 255, 255, 0) 100%), linear-gradient(90deg, var(--accent2), var(--accent));
    background-size: 46px 100%, 100% 100%;
    background-repeat: repeat-x, no-repeat;
    animation: progressFlow 0.9s linear infinite;
    box-shadow: 0 0 14px rgba(17, 208, 227, 0.6);
    border-radius: 999px;
    transition: width 0.12s linear;
}

.lk-work-meta {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.lk-work-perc {
    font-size: 15px;
    font-weight: 600;
    color: var(--accent);
}

.lk-work-caption {
    font-family: monospace;
    font-size: 11px;
    color: var(--faint);
    letter-spacing: 1px;
}
</style>
