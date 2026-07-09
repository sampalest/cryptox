<template>
    <div class="lk-overlay" role="dialog" aria-label="Settings">
        <div class="lk-overlay-title">Settings</div>
        <div class="lk-settings-section">
            <div class="lk-settings-label">APPEARANCE</div>
            <div class="lk-settings-seg">
                <button
                    v-for="option in modes"
                    :key="option.value"
                    type="button"
                    class="lk-settings-seg-btn"
                    :class="{ active: theme.mode === option.value }"
                    @click="theme.setMode(option.value)"
                >
                    <svg v-if="option.value === 'light'" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6L19 19M19 5l-1.4 1.4M6.4 17.6L5 19"></path></svg>
                    <svg v-else-if="option.value === 'dark'" width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"></path></svg>
                    <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"></rect><path d="M8 20h8M12 16v4"></path></svg>
                    {{ option.label }}
                </button>
            </div>
            <div class="lk-settings-hint">{{ appearanceHint }}</div>
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
                    <svg :width="sizeIconPx(option.id)" :height="sizeIconPx(option.id)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"></rect><path d="M3 9h18"></path><circle cx="6.2" cy="6.6" r="0.4"></circle><circle cx="9" cy="6.6" r="0.4"></circle></svg>
                    {{ option.label }}
                </button>
            </div>
            <div class="lk-settings-hint">Scales the whole window. It stays this size until you change it.</div>
        </div>
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
                    <svg v-if="option.id === 'trash'" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    <svg v-else-if="option.id === 'permanent'" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><path d="m10 11 4 5"></path><path d="m14 11-4 5"></path></svg>
                    <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><path d="M12 17h.01"></path></svg>
                    {{ option.label }}
                </button>
            </div>
            <div class="lk-settings-hint">{{ deleteHint }}</div>
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
        <glass-button variant="primary" @click="ui.closeOverlays()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>
            Done
        </glass-button>
    </div>
</template>
<script>
import GlassButton from "@/components/ui/GlassButton.vue";
import { APP_ICONS, useAppIconStore } from "@/store/appIcon";
import { useAppStore } from "@/store/app";
import { DELETE_MODES, useDeleteBehaviorStore } from "@/store/deleteBehavior";
import { useThemeStore } from "@/store/theme";
import { useUiStore } from "@/store/ui";
import { WINDOW_SIZES, useWindowSizeStore } from "@/store/windowSize";

export default {
    name: "settings-overlay",
    components: {
        "glass-button": GlassButton
    },
    setup() {
        return { appIcon: useAppIconStore(), appStore: useAppStore(), deleteBehavior: useDeleteBehaviorStore(), theme: useThemeStore(), ui: useUiStore(), windowSize: useWindowSizeStore() };
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
        deleteHint() {
            if (this.deleteBehavior.mode === "ask") return "Asks what to do with the source file after each operation.";
            if (this.deleteBehavior.mode === "permanent") return "A checkbox on the password screen deletes the source file permanently.";
            return "A checkbox on the password screen moves the source file to the Trash.";
        },
        appearanceHint() {
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
<style lang="scss" scoped>
// The settings panel is taller than the About panel (and taller still on macOS
// with the app-icon grid). Centering with justify-content clips the top once the
// content overflows, so center via auto margins instead: the block stays centered
// when it fits and scrolls from the top edge when it does not. Extra vertical
// padding keeps top and bottom breathing room in both cases.
.lk-overlay {
    justify-content: flex-start;
    padding-top: 36px;
    padding-bottom: 36px;

    & > :first-child {
        margin-top: auto;
    }

    & > :last-child {
        margin-bottom: auto;
    }
}

.lk-settings-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
}

.lk-settings-label {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--dim);
    letter-spacing: 0.5px;
}

.lk-settings-seg {
    display: flex;
    gap: 6px;
    background: var(--track);
    border-radius: 12px;
    padding: 5px;
    width: fit-content;
}

.lk-settings-seg-btn {
    display: flex;
    align-items: center;
    gap: 7px;
    border: none;
    border-radius: 9px;
    padding: 9px 15px;
    font-family: Poppins, sans-serif;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    background: none;
    color: var(--dim);
    transition: background 0.25s ease, color 0.25s ease, box-shadow 0.25s ease, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);

    &:focus {
        outline: none;
    }

    &:hover:not(.active) {
        color: var(--text);
        transform: translateY(-1px);
    }

    &:active {
        transform: scale(0.93);
    }

    &.active {
        background: var(--surface);
        color: var(--text);
        box-shadow: 0 2px 8px rgba(20, 24, 32, 0.14);
        animation: lkSettingsPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
}

@keyframes lkSettingsPop {
    0% { transform: scale(1); }
    45% { transform: scale(1.08); }
    100% { transform: scale(1); }
}

.lk-settings-hint {
    font-size: 12px;
    color: var(--faint);
}

.lk-settings-icons {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
    background: var(--track);
    border-radius: 14px;
    padding: 6px;
}

.lk-settings-icon-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    border: none;
    border-radius: 11px;
    padding: 8px 14px 6px;
    font-family: Poppins, sans-serif;
    cursor: pointer;
    background: none;
    color: var(--dim);
    transition: background 0.25s ease, color 0.25s ease, box-shadow 0.25s ease, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);

    &:focus {
        outline: none;
    }

    &:hover:not(.active) {
        color: var(--text);
        transform: translateY(-1px);
    }

    &:active {
        transform: scale(0.93);
    }

    &.active {
        background: var(--surface);
        color: var(--text);
        box-shadow: 0 2px 8px rgba(20, 24, 32, 0.14), inset 0 0 0 1.5px var(--accent);
        animation: lkSettingsPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
}

.lk-settings-icon-img {
    width: 52px;
    height: 52px;
}

.lk-settings-icon-preview {
    position: relative;
    display: block;
    width: 52px;
    height: 52px;
}

.lk-settings-icon-img-half {
    position: absolute;
    top: 0;
    left: 0;
    clip-path: polygon(100% 0, 100% 100%, 0 100%);
}

.lk-settings-icon-name {
    font-size: 11px;
    font-weight: 500;
}
</style>
