<template>
    <!-- novalidate: every validation surfaces as a toast, never the
         browser's native bubble. -->
    <form class="lk-pass" novalidate @submit.prevent="submitStep">
        <transition :name="stepTransition" mode="out-in">
            <div v-if="step === 1" key="credentials" class="lk-pass-step">
                <div class="lk-pass-head">
                    <div class="lk-title">{{ isDecrypt ? "Decrypt file" : "Encrypt files" }}</div>
                    <div class="lk-sub">{{ isDecrypt ? "Enter the password this file was locked with." : "Choose a password. The dino guards the rest." }}</div>
                </div>
                <div v-if="fileLabel" class="lk-chip">
                    <lk-icon v-if="isFolder" name="folder" :width="14" :height="16" />
                    <lk-icon v-else name="file" :width="14" :height="16" />
                    <span>{{ fileLabel }}</span>
                </div>
                <div class="lk-pass-fields">
                    <div class="lk-input">
                        <lk-icon name="lock" :width="15" :height="16" />
                        <input :type="showPassword ? 'text' : 'password'" name="password" id="password" v-model="password"
                            placeholder="Password"
                            :autocomplete="isDecrypt ? 'current-password' : 'new-password'"
                            autocapitalize="off" autocorrect="off" spellcheck="false">
                        <button type="button" class="lk-eye" :aria-label="showPassword ? 'Hide password' : 'Show password'" @click="showPassword = !showPassword">
                            <lk-icon v-if="showPassword" name="eye-off" :size="16" />
                            <lk-icon v-else name="eye" :size="16" />
                        </button>
                    </div>
                    <div v-if="!isDecrypt" class="lk-input">
                        <lk-icon name="lock" :width="15" :height="16" />
                        <input :type="showNewPassword ? 'text' : 'password'" name="newpassword" id="newpassword" v-model="newPassword"
                            placeholder="Retype password"
                            autocomplete="new-password" autocapitalize="off" autocorrect="off" spellcheck="false">
                        <button type="button" class="lk-eye" :aria-label="showNewPassword ? 'Hide password' : 'Show password'" @click="showNewPassword = !showNewPassword">
                            <lk-icon v-if="showNewPassword" name="eye-off" :size="16" />
                            <lk-icon v-else name="eye" :size="16" />
                        </button>
                    </div>
                </div>
                <div v-if="optionRows.length" class="lk-pass-rows">
                    <label v-for="row in optionRows" :key="row.key" class="lk-pass-row">
                        <input class="lk-pass-row-input" type="checkbox" :checked="row.checked" @change="row.change($event)">
                        <span class="lk-pass-row-icon" aria-hidden="true">
                            <lk-icon :name="row.icon" :size="17" />
                        </span>
                        <span class="lk-pass-row-text">
                            <span class="lk-pass-row-label">{{ row.label }}</span>
                            <span class="lk-pass-row-hint">{{ row.hint }}</span>
                        </span>
                        <span class="lk-pass-row-switch" aria-hidden="true"></span>
                    </label>
                </div>
            </div>
            <div v-else key="expiry" class="lk-pass-step">
                <div class="lk-pass-head">
                    <div class="lk-title">Set expiration</div>
                    <div class="lk-sub">After this moment the file can no longer be decrypted.</div>
                </div>
                <expiry-picker v-model="expireAt" :min="minMs"></expiry-picker>
                <div class="lk-pass-summary">
                    <lk-icon name="hourglass" :width="13" :height="14" />
                    <span>Expires {{ expireSummary }}</span>
                </div>
            </div>
        </transition>
        <div class="lk-pass-actions">
            <glass-button variant="glass" @click="secondaryAction">
                <lk-icon v-if="step === 2" name="chevron-left" :size="15" />
                <lk-icon v-else name="x" :size="15" />
                {{ step === 2 ? "Back" : "Cancel" }}
            </glass-button>
            <glass-button variant="primary" type="submit">
                <lk-icon v-if="isDecrypt" name="lock-open" :size="16" />
                <lk-icon v-else-if="goesToExpiry" name="arrow-right" :size="16" />
                <lk-icon v-else name="lock-wide" :size="16" />
                <span>{{ primaryLabel }}</span>
            </glass-button>
        </div>
    </form>
</template>
<script>
import * as e from "@shared/exceptions.js";
import ExpiryPicker from "@/components/ui/ExpiryPicker.vue";
import GlassButton from "@/components/ui/GlassButton.vue";
import LkIcon from "@/components/ui/LkIcon.vue";
import { useDeleteBehaviorStore } from "@/store/deleteBehavior";
import { useErasePolicyStore } from "@/store/erasePolicy";
import { useToastStore } from "@/store/toasts";

export default {
    name: "password-screen",
    setup() {
        return { deleteBehavior: useDeleteBehaviorStore(), erasePolicy: useErasePolicyStore(), toasts: useToastStore() };
    },
    data: () => {
        return {
            step: 1,
            stepBack: false,
            password: "",
            newPassword: "",
            showPassword: false,
            showNewPassword: false,
            expireEnabled: false,
            expireAt: null,
            minMs: 0
        };
    },
    components: {
        "expiry-picker": ExpiryPicker,
        "glass-button": GlassButton,
        "lk-icon": LkIcon
    },
    emits: ["password", "cancel", "setDecrypt", "expiration"],
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
        },
        optionRows() {
            const rows = [];
            if (this.deleteBehavior.usesCheckbox) {
                rows.push({
                    key: "delete",
                    icon: "trash",
                    label: this.deleteLabel,
                    hint: this.deleteTitle,
                    checked: this.deleteChecked,
                    change: event => this.toggleDelete(event.target.checked)
                });
            }
            if (!this.isDecrypt) {
                rows.push({
                    key: "expire",
                    icon: "clock",
                    label: "Set an expiration date",
                    hint: "Configured on the next screen",
                    checked: this.expireEnabled,
                    change: event => this.toggleExpire(event.target.checked)
                });
                rows.push({
                    key: "erase",
                    icon: "shield-alert",
                    label: "Erase after failed attempts",
                    hint: `Self-destructs after ${this.erasePolicy.maxAttempts} wrong passwords`,
                    checked: this.erasePolicy.enabled,
                    change: event => this.toggleErase(event)
                });
            }
            return rows;
        },
        goesToExpiry() {
            return !this.isDecrypt && this.expireEnabled && this.step === 1;
        },
        primaryLabel() {
            if (this.isDecrypt) return "Decrypt";
            return this.goesToExpiry ? "Next" : "Encrypt";
        },
        stepTransition() {
            return this.stepBack ? "lk-step-back" : "lk-step-fwd";
        },
        expireSummary() {
            if (!this.expireAt) return "";
            return new Date(this.expireAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
        }
    },
    methods: {
        toggleDelete(checked) {
            if (this.isDecrypt) this.deleteBehavior.setDeleteEncrypted(checked);
            else this.deleteBehavior.setDeleteOriginal(checked);
        },
        toggleExpire(checked) {
            this.expireEnabled = checked;
        },
        // Enabling still runs the native irreversible-loss confirm (store side);
        // declining leaves the store off, so snap the checkbox back to it.
        async toggleErase(event) {
            await this.erasePolicy.choose(event.target.checked ? this.erasePolicy.maxAttempts : "off");
            event.target.checked = this.erasePolicy.enabled;
        },
        secondaryAction() {
            if (this.step === 2) {
                this.stepBack = true;
                this.step = 1;
                return;
            }
            this.$emit("cancel");
        },
        checkCredentials() {
            try {
                if (!this.password) {
                    throw new e.NoValidPassword("This password is empty O_o");
                }
                if (this.password.length <= 4) {
                    throw new e.NoValidPassword("This password is too short. Please, choose another one.");
                }
                if (!this.isDecrypt && this.password !== this.newPassword) {
                    throw new e.NoValidPassword("Passwords don't match.");
                }
                return true;
            } catch (error) {
                this.password = "";
                this.newPassword = "";
                this.showPassword = false;
                this.showNewPassword = false;
                this.toasts.error(error.message);
                return false;
            }
        },
        submitStep() {
            if (this.step === 1) {
                if (!this.checkCredentials()) return;
                // Mobile-style navigation: expiration gets its own screen; the
                // password survives the detour and is emitted from step 2.
                if (this.goesToExpiry) {
                    this.minMs = Date.now();
                    if (!this.expireAt || this.expireAt <= this.minMs) {
                        const tomorrow = new Date(this.minMs + 24 * 60 * 60 * 1000);
                        tomorrow.setSeconds(0, 0);
                        this.expireAt = tomorrow.getTime();
                    }
                    this.stepBack = false;
                    this.step = 2;
                    return;
                }
                this.emitObject();
                return;
            }
            if (!this.expireAt || this.expireAt <= Date.now()) {
                this.toasts.error("The expiration date must be in the future.");
                return;
            }
            this.emitObject();
        },
        emitObject() {
            const expiration = !this.isDecrypt && this.expireEnabled && this.expireAt ? { at: this.expireAt } : null;
            this.$emit("setDecrypt", this.isDecrypt);
            this.$emit("expiration", expiration);
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
