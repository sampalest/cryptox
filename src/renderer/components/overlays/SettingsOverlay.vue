<template>
    <div class="lk-overlay" role="dialog" aria-label="Settings">
        <div class="lk-overlay-title">Settings</div>
        <div class="lk-settings-group-title">Appearance</div>
        <div class="lk-settings-section">
            <div class="lk-settings-label">THEME</div>
            <div class="lk-settings-seg">
                <button
                    v-for="option in modes"
                    :key="option.value"
                    type="button"
                    class="lk-settings-seg-btn"
                    :class="{ active: theme.mode === option.value }"
                    @click="theme.setMode(option.value)"
                >
                    <lk-icon v-if="option.value === 'light'" name="sun" :size="15" />
                    <lk-icon v-else-if="option.value === 'dark'" name="moon" :size="15" />
                    <lk-icon v-else name="monitor" :size="15" />
                    {{ option.label }}
                </button>
            </div>
            <div class="lk-settings-hint">{{ themeHint }}</div>
        </div>
        <div class="lk-settings-section">
            <div class="lk-settings-label">WINDOW SIZE</div>
            <div class="lk-settings-seg">
                <button
                    v-for="option in sizes"
                    :key="option.id"
                    type="button"
                    class="lk-settings-seg-btn"
                    :class="{ active: windowSize.size === option.id }"
                    @click="windowSize.setSize(option.id)"
                >
                    <lk-icon name="window" :size="sizeIconPx(option.id)" />
                    {{ option.label }}
                </button>
            </div>
            <div class="lk-settings-hint">Scales the whole window. It stays this size until you change it.</div>
        </div>
        <div v-if="isMac" class="lk-settings-section">
            <div class="lk-settings-label">APP ICON</div>
            <div class="lk-settings-icons">
                <button
                    v-for="icon in icons"
                    :key="icon.id"
                    type="button"
                    class="lk-settings-icon-btn"
                    :class="{ active: appIcon.icon === icon.id }"
                    :title="icon.label"
                    @click="appIcon.setIcon(icon.id)"
                >
                    <span v-if="icon.id === 'auto'" class="lk-settings-icon-preview">
                        <img class="lk-settings-icon-img" :src="'appicons/default.png'" :alt="icon.label">
                        <img class="lk-settings-icon-img lk-settings-icon-img-half" :src="'appicons/dark.png'" alt="" aria-hidden="true">
                    </span>
                    <img v-else class="lk-settings-icon-img" :src="`appicons/${icon.id}.png`" :alt="icon.label">
                    <span class="lk-settings-icon-name">{{ icon.label }}</span>
                </button>
            </div>
            <div class="lk-settings-hint">{{ iconHint }}</div>
        </div>
        <div class="lk-settings-group-title">Behavior</div>
        <div class="lk-settings-section">
            <div class="lk-settings-label">AFTER SUCCESS</div>
            <div class="lk-settings-seg">
                <button
                    v-for="option in deleteModes"
                    :key="option.id"
                    type="button"
                    class="lk-settings-seg-btn"
                    :class="{ active: deleteBehavior.mode === option.id }"
                    @click="deleteBehavior.setMode(option.id)"
                >
                    <lk-icon v-if="option.id === 'trash'" name="trash" :size="15" />
                    <lk-icon v-else-if="option.id === 'permanent'" name="trash-x" :size="15" />
                    <lk-icon v-else name="help-circle" :size="15" />
                    {{ option.label }}
                </button>
            </div>
            <div class="lk-settings-hint">{{ deleteHint }}</div>
        </div>
        <div class="lk-settings-group-title">Security</div>
        <div class="lk-settings-section">
            <div class="lk-settings-label">ERASE AFTER FAILED ATTEMPTS</div>
            <div class="lk-settings-seg">
                <button
                    v-for="option in eraseOptions"
                    :key="option.id"
                    type="button"
                    class="lk-settings-seg-btn"
                    :class="{ active: eraseActive === option.id }"
                    @click="erasePolicy.choose(option.id)"
                >
                    <lk-icon v-if="option.id === 'off'" name="shield-off" :size="15" />
                    <lk-icon v-else name="shield-alert" :size="15" />
                    {{ option.label }}
                </button>
            </div>
            <div class="lk-settings-hint">{{ eraseHint }}</div>
        </div>
        <div class="lk-settings-section">
            <div class="lk-settings-label">TRUSTED TIME</div>
            <div class="lk-settings-seg">
                <button
                    v-for="option in timeSources"
                    :key="option.id"
                    type="button"
                    class="lk-settings-seg-btn"
                    :class="{ active: timeSource.source === option.id }"
                    @click="timeSource.choose(option.id)"
                >
                    <lk-icon v-if="option.id === 'system'" name="clock" :size="15" />
                    <lk-icon v-else-if="option.id === 'cloudflare'" name="cloud" :size="15" />
                    <lk-icon v-else name="server" :size="15" />
                    {{ option.label }}
                </button>
            </div>
            <div v-if="timeSource.source === 'custom'" class="lk-input lk-settings-host">
                <lk-icon name="globe" :width="15" :height="16" />
                <input type="text" name="timeserver" id="timeserver" placeholder="nts.example.com"
                    autocapitalize="off" autocorrect="off" spellcheck="false"
                    :value="timeSource.customHost" @input="timeSource.setCustomHost($event.target.value)">
            </div>
            <div v-if="timeSource.source !== 'system'" class="lk-settings-seg">
                <button
                    v-for="option in failModes"
                    :key="option.id"
                    type="button"
                    class="lk-settings-seg-btn"
                    :class="{ active: timeSource.failClosed === option.id }"
                    @click="timeSource.chooseFailClosed(option.id)"
                >
                    {{ option.label }}
                </button>
            </div>
            <div class="lk-settings-hint">{{ timeHint }}</div>
        </div>
        <glass-button variant="primary" @click="ui.closeOverlays()">
            <lk-icon name="check" :size="16" />
            Done
        </glass-button>
    </div>
</template>
<script>
import GlassButton from "@/components/ui/GlassButton.vue";
import LkIcon from "@/components/ui/LkIcon.vue";
import { APP_ICONS, useAppIconStore } from "@/store/appIcon";
import { useAppStore } from "@/store/app";
import { DELETE_MODES, useDeleteBehaviorStore } from "@/store/deleteBehavior";
import { ERASE_ATTEMPT_OPTIONS, useErasePolicyStore } from "@/store/erasePolicy";
import { useTimeSourceStore } from "@/store/timeSource";
import { useThemeStore } from "@/store/theme";
import { useUiStore } from "@/store/ui";
import { WINDOW_SIZES, useWindowSizeStore } from "@/store/windowSize";

export default {
    name: "settings-overlay",
    components: {
        "glass-button": GlassButton,
        "lk-icon": LkIcon
    },
    setup() {
        return { appIcon: useAppIconStore(), appStore: useAppStore(), deleteBehavior: useDeleteBehaviorStore(), erasePolicy: useErasePolicyStore(), theme: useThemeStore(), timeSource: useTimeSourceStore(), ui: useUiStore(), windowSize: useWindowSizeStore() };
    },
    computed: {
        isMac() {
            return this.appStore.isMac;
        },
        modes() {
            return [
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
                { value: "system", label: "System" }
            ];
        },
        icons() {
            return APP_ICONS;
        },
        sizes() {
            return WINDOW_SIZES;
        },
        deleteModes() {
            return DELETE_MODES;
        },
        eraseOptions() {
            return [
                { id: "off", label: "Off" },
                ...ERASE_ATTEMPT_OPTIONS.map(count => ({ id: count, label: String(count) }))
            ];
        },
        eraseActive() {
            return this.erasePolicy.enabled ? this.erasePolicy.maxAttempts : "off";
        },
        eraseHint() {
            if (!this.erasePolicy.enabled) return "Nothing is ever erased after a wrong password.";
            return `New encrypted files are permanently erased after ${this.erasePolicy.maxAttempts} wrong passwords. This cannot be undone.`;
        },
        timeSources() {
            return [
                { id: "system", label: "System clock" },
                { id: "cloudflare", label: "Cloudflare" },
                { id: "custom", label: "Custom" }
            ];
        },
        failModes() {
            return [
                { id: false, label: "Fall back to clock" },
                { id: true, label: "Fail closed" }
            ];
        },
        timeHint() {
            if (this.timeSource.source === "system") return "Files with an expiration date are checked against this computer's clock.";
            if (this.timeSource.failClosed) return "Expiring files refuse to decrypt when the time server is unreachable.";
            return "Expiring files are checked against the time server, or this computer's clock when it is unreachable.";
        },
        deleteHint() {
            if (this.deleteBehavior.mode === "ask") return "Asks what to do with the source file after each operation.";
            if (this.deleteBehavior.mode === "permanent") return "A checkbox on the password screen deletes the source file permanently.";
            return "A checkbox on the password screen moves the source file to the Trash.";
        },
        themeHint() {
            if (this.theme.mode === "system") return "Follows your OS appearance.";
            return this.theme.mode === "dark" ? "Always dark, day or night." : "Always light and airy.";
        },
        iconHint() {
            if (this.appIcon.icon === "auto") return "Changes the Dock icon. Auto matches the app appearance.";
            return "Changes the Dock icon. Default follows your system appearance.";
        }
    },
    methods: {
        sizeIconPx(id) {
            return { "default": 12, "l": 15, "xl": 18 }[id];
        },
        onKeydown(event) {
            if (event.key === "Escape") this.ui.closeOverlays();
        }
    },
    async beforeMount() {
        await this.appStore.load();
    },
    mounted() {
        window.addEventListener("keydown", this.onKeydown);
    },
    beforeUnmount() {
        window.removeEventListener("keydown", this.onKeydown);
    }
};
</script>
