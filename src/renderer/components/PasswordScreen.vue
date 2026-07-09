<template>
    <form class="lk-pass" @submit.prevent="checkPassword">
        <div class="lk-pass-head">
            <div class="lk-title">{{ isDecrypt ? "Decrypt file" : "Encrypt files" }}</div>
            <div class="lk-sub">{{ isDecrypt ? "Enter the password this file was locked with." : "Choose a password. The dino guards the rest." }}</div>
        </div>
        <div v-if="fileLabel" class="lk-chip">
            <svg v-if="isFolder" width="14" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"></path></svg>
            <svg v-else width="14" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"></path><path d="M14 3v5h5"></path></svg>
            <span>{{ fileLabel }}</span>
        </div>
        <div class="lk-pass-fields">
            <div class="lk-input">
                <svg width="15" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>
                <input :type="showPassword ? 'text' : 'password'" name="password" id="password" v-model="password"
                    placeholder="Password"
                    :autocomplete="isDecrypt ? 'current-password' : 'new-password'"
                    autocapitalize="off" autocorrect="off" spellcheck="false"
                    @input="error = ''">
                <button type="button" class="lk-eye" :aria-label="showPassword ? 'Hide password' : 'Show password'" @click="showPassword = !showPassword">
                    <svg v-if="showPassword" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"></path><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"></path><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"></path><line x1="2" x2="22" y1="2" y2="22"></line></svg>
                    <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                </button>
            </div>
            <div v-if="!isDecrypt" class="lk-input">
                <svg width="15" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>
                <input :type="showNewPassword ? 'text' : 'password'" name="newpassword" id="newpassword" v-model="newPassword"
                    placeholder="Retype password"
                    autocomplete="new-password" autocapitalize="off" autocorrect="off" spellcheck="false"
                    @input="error = ''">
                <button type="button" class="lk-eye" :aria-label="showNewPassword ? 'Hide password' : 'Show password'" @click="showNewPassword = !showNewPassword">
                    <svg v-if="showNewPassword" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"></path><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"></path><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"></path><line x1="2" x2="22" y1="2" y2="22"></line></svg>
                    <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                </button>
            </div>
        </div>
        <label v-if="deleteBehavior.usesCheckbox" class="lk-pass-delete" :title="deleteTitle">
            <input class="lk-pass-delete-input" type="checkbox" :checked="deleteChecked" @change="toggleDelete($event.target.checked)">
            <span class="lk-pass-delete-box" aria-hidden="true">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>
            </span>
            <span class="lk-pass-delete-text">{{ deleteLabel }}</span>
        </label>
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
import { useDeleteBehaviorStore } from "@/store/deleteBehavior";

export default {
    name: "password-screen",
    setup() {
        return { deleteBehavior: useDeleteBehaviorStore() };
    },
    data: () => {
        return {
            password: "",
            newPassword: "",
            showPassword: false,
            showNewPassword: false,
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
        },
        // Folder icon only for a single selected directory; multi-selections
        // keep the generic file icon.
        isFolder() {
            return Boolean(this.files && this.files.length === 1 && this.files[0].isDirectory);
        },
        deleteChecked() {
            return this.isDecrypt ? this.deleteBehavior.deleteEncrypted : this.deleteBehavior.deleteOriginal;
        },
        deleteLabel() {
            return this.isDecrypt ? "Delete encrypted file after decrypting" : "Delete original after encrypting";
        },
        deleteTitle() {
            return this.deleteBehavior.mode === "permanent" ? "Deleted permanently" : "Moved to the Trash";
        }
    },
    methods: {
        toggleDelete(checked) {
            if (this.isDecrypt) this.deleteBehavior.setDeleteEncrypted(checked);
            else this.deleteBehavior.setDeleteOriginal(checked);
        },
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
                this.showPassword = false;
                this.showNewPassword = false;
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
            this.showPassword = false;
            this.showNewPassword = false;
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

.lk-input > svg {
    color: var(--faint);
    flex-shrink: 0;
}

.lk-eye {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    margin: 0;
    border: none;
    background: none;
    color: var(--faint);
    cursor: pointer;
    line-height: 0;
    flex-shrink: 0;
    transition: color 0.2s ease;

    &:hover,
    &:focus-visible {
        color: var(--text);
    }
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

.lk-pass-delete {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    user-select: none;
    color: var(--dim);
    font-size: 12.5px;
    transition: color 0.2s ease;

    &:hover {
        color: var(--text);
    }
}

.lk-pass-delete-input {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: 0;
    padding: 0;
    border: 0;
    clip-path: inset(50%);
    overflow: hidden;
    white-space: nowrap;
}

.lk-pass-delete-box {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 17px;
    height: 17px;
    border-radius: 5px;
    background: var(--inp-bg);
    box-shadow: inset 0 0 0 1px var(--inp-bd);
    color: transparent;
    flex-shrink: 0;
    transition: background 0.2s ease, box-shadow 0.2s ease, color 0.2s ease;
}

.lk-pass-delete-input:checked + .lk-pass-delete-box {
    background: var(--accent);
    box-shadow: none;
    color: #fff;
}

.lk-pass-delete-input:focus-visible + .lk-pass-delete-box {
    box-shadow: 0 0 0 2px var(--accent2);
}
</style>
