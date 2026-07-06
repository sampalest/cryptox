<template>
    <form class="lk-pass" @submit.prevent="checkPassword">
        <div class="lk-pass-head">
            <div class="lk-title">{{ isDecrypt ? "Decrypt file" : "Encrypt files" }}</div>
            <div class="lk-sub">{{ isDecrypt ? "Enter the password this file was locked with." : "Choose a password. The dino guards the rest." }}</div>
        </div>
        <div v-if="fileLabel" class="lk-chip">
            <svg width="14" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"></path><path d="M14 3v5h5"></path></svg>
            <span>{{ fileLabel }}</span>
        </div>
        <div class="lk-pass-fields">
            <div class="lk-input">
                <svg width="15" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>
                <input type="password" name="password" id="password" v-model="password"
                    placeholder="Password"
                    :autocomplete="isDecrypt ? 'current-password' : 'new-password'"
                    autocapitalize="off" autocorrect="off" spellcheck="false"
                    @input="error = ''">
            </div>
            <div v-if="!isDecrypt" class="lk-input">
                <svg width="15" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>
                <input type="password" name="newpassword" id="newpassword" v-model="newPassword"
                    placeholder="Retype password"
                    autocomplete="new-password" autocapitalize="off" autocorrect="off" spellcheck="false"
                    @input="error = ''">
            </div>
        </div>
        <div v-if="error" class="lk-error">{{ error }}</div>
        <div class="lk-pass-actions">
            <glass-button variant="glass" @click="$emit('cancel')">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
                Cancel
            </glass-button>
            <glass-button variant="primary" type="submit">
                <svg v-if="isDecrypt" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>
                <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                <span>{{ isDecrypt ? "Decrypt" : "Encrypt" }}</span>
            </glass-button>
        </div>
    </form>
</template>
<script>
import * as e from "@shared/exceptions.js";
import GlassButton from "@/components/ui/GlassButton.vue";

export default {
    name: "password-screen",
    data: () => {
        return {
            password: "",
            newPassword: "",
            error: ""
        };
    },
    components: {
        "glass-button": GlassButton
    },
    emits: ["password", "cancel", "setDecrypt"],
    props: {
        isDecrypt: {
            type: Boolean,
            default: true
        },
        files: {
            type: Array,
            default: null
        }
    },
    computed: {
        fileLabel() {
            if (!this.files || !this.files.length) return "";
            if (this.files.length === 1) return this.files[0].name;
            return `${this.files.length} files`;
        }
    },
    methods: {
        checkPassword() {
            try {
                if (!this.password) {
                    throw new e.NoValidPassword("This password is empty O_o");
                }
                else if (this.password.length <= 4) {
                    throw new e.NoValidPassword("This password is too short. Please, choose another one.");
                }
                else if (this.isDecrypt) {
                    this.emitObject();
                    return;
                }
                else if (this.password !== this.newPassword) {
                    throw new e.NoValidPassword("Passwords don't match.");
                }

                this.emitObject();

            } catch (error) {
                this.password = "";
                this.newPassword = "";
                this.error = error.message;
            }
        },
        emitObject() {
            this.$emit("setDecrypt", this.isDecrypt);
            this.$emit("password", this.password);
            // Clear the plaintext password on the success path too. JS strings
            // are immutable, so this is best-effort hygiene (no real zeroing),
            // matching the error path above.
            this.password = "";
            this.newPassword = "";
        }
    }
};
</script>
<style lang="scss" scoped>
.lk-pass {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 18px;
    padding: 28px;
    text-align: center;
    animation: fadeScreen 0.62s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.lk-pass-head {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.lk-chip svg {
    color: var(--faint);
    flex-shrink: 0;
}

.lk-input svg {
    color: var(--faint);
    flex-shrink: 0;
}

.lk-pass-fields {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 300px;
}

.lk-pass-actions {
    display: flex;
    gap: 12px;
    margin-top: 4px;
}
</style>
