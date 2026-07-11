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
            <lockasaur-lock class="lk-work-lock" :class="{ 'lk-work-lock-done': done }" :size="150" :lock-state="lockState" />
        </div>
        <div class="lk-work-track">
            <div class="lk-work-bar" :style="{ width: (fileEvent.loader ? 100 : percent.value) + '%' }"></div>
        </div>
        <div class="lk-work-meta">
            <div v-if="!fileEvent.loader" class="lk-work-perc">{{ percent.value }}%</div>
            <div class="lk-work-caption">AES-256 · 100% dino-approved</div>
        </div>
        <glass-button variant="glass" @click="cancel">
            <lk-icon name="x" :size="15" aria-hidden="true" />
            Cancel
        </glass-button>
    </div>
</template>
<script>
import fileCrypto from "@/components/mixins/filecryto.js";
import GlassButton from "@/components/ui/GlassButton.vue";
import LockasaurLock from "@/components/ui/LockasaurLock.vue";
import { useToastStore } from "@/store/toasts";
import LkIcon from "@/components/ui/LkIcon.vue";

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
            done: false,
            finishSTO: null
        };
    },
    mixins: [fileCrypto],
    components: {
        "glass-button": GlassButton,
        "lockasaur-lock": LockasaurLock,
        "lk-icon": LkIcon
    },
    emits: ["finish", "cancel", "retry"],
    props: {
        files: {
            type: Array,
            required: true
        },
        password: {
            type: String,
            default: ""
        },
        // Encrypt-only { at: epoch ms } from the password screen, or null.
        expiration: {
            type: Object,
            default: null
        },
        isDecrypt: {
            type: Boolean,
            default: true
        }
    },
    computed: {
        // The lock mirrors the file's current state and only transitions on
        // success: open (plaintext) while encrypting, then it snaps shut;
        // locked while decrypting, then the shackle springs open.
        lockState() {
            if (this.done) return this.isDecrypt ? "unlocking" : "locking";
            return this.isDecrypt ? "locked" : "open";
        },
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
            // Let the shackle's 0.9 s closing or opening animation play out
            // and rest visibly for at least a second before the success screen.
            this.done = true;
            this.finishSTO = setTimeout(()=> {
                this.$emit("finish", this.finish);
            }, 2100);
        },
        fileEvent: {
            deep: true,
            handler() {
                if (this.fileEvent.error) {
                    useToastStore().error("Cannot decrypt file...");
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
        // Wrong password: stop any sibling operations, then let Home reopen
        // the password screen with the selection still loaded.
        retryPassword() {
            this.cancelOperations();
            this.$emit("retry");
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
