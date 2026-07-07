<template>
    <div class="lk-overlay" role="dialog" aria-label="About">
        <word-mark :size="30" />
        <div class="lk-about-logo">
            <div class="lk-about-halo" aria-hidden="true"></div>
            <img src="@/assets/dino-vector.svg" alt="" width="124">
        </div>
        <div class="lk-about-head">
            <div class="lk-about-tagline">Encryption with <span class="lk-about-bite">bite.</span></div>
            <div class="lk-about-version">
                <span class="lk-about-version-dot" aria-hidden="true"></span>
                Version {{ version }} · local-first &amp; open source
            </div>
        </div>
        <div class="lk-about-credit">
            Designed &amp; built by <b>Sam</b>. Your files are encrypted on your device and never touch a server.
        </div>
        <a class="lk-about-github" role="button" tabindex="0"
            @click.prevent="goGithub"
            @keydown.enter.prevent="goGithub"
            @keydown.space.prevent="goGithub">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.09.68-.22.68-.49 0-.24-.01-.87-.01-1.71-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.49-1.11-1.49-.91-.64.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.55-1.14-4.55-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.27 2.75 1.05A9.36 9.36 0 0 1 12 6.84c.85 0 1.71.12 2.51.34 1.91-1.32 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.48-.01 2.82 0 .27.18.59.69.49A10.02 10.02 0 0 0 22 12.25C22 6.58 17.52 2 12 2z"></path></svg>
            View the repo on GitHub
        </a>
        <div class="lk-about-footer">Made with 🦕 &amp; a lot of caffeine</div>
        <glass-button variant="primary" @click="ui.closeOverlays()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>
            Done
        </glass-button>
    </div>
</template>
<script>
import GlassButton from "@/components/ui/GlassButton.vue";
import WordMark from "@/components/ui/Wordmark.vue";
import { useUiStore } from "@/store/ui";

export default {
    name: "about-overlay",
    components: {
        "glass-button": GlassButton,
        "word-mark": WordMark
    },
    setup() {
        return { ui: useUiStore() };
    },
    computed: {
        version() {
            return __APP_VERSION__;
        }
    },
    methods: {
        goGithub() {
            window.lockasaur.shell.openExternal("https://github.com/sampalest/cryptox");
        },
        onKeydown(event) {
            if (event.key === "Escape") this.ui.closeOverlays();
        }
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
.lk-about-logo {
    position: relative;
    flex-shrink: 0;

    img {
        position: relative;
        display: block;
        animation: logoIdle 4s ease-in-out infinite;
        filter: drop-shadow(0 14px 28px rgba(7, 102, 229, 0.3));
    }
}

.lk-about-halo {
    position: absolute;
    inset: -12px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(47, 225, 229, 0.22), transparent 68%);
}

.lk-about-head {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
}

.lk-about-tagline {
    font-size: 14px;
    color: var(--dim);
}

.lk-about-bite {
    color: #0766e5;
    font-weight: 700;
}

.lk-about-version {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    margin-top: 6px;
    background: var(--surface);
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    border: 1px solid var(--bd);
    border-radius: 999px;
    padding: 5px 14px;
    font-size: 12px;
    color: var(--faint);
}

.lk-about-version-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent2);
}

.lk-about-credit {
    font-size: 13.5px;
    color: var(--dim);
    text-align: center;
    max-width: 330px;
    line-height: 1.6;

    b {
        color: var(--text);
    }
}

.lk-about-github {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    width: 286px;
    box-sizing: border-box;
    text-decoration: none;
    background: var(--surface);
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    box-shadow: inset 0 1px 0 var(--glass-edge), 0 6px 18px rgba(20, 24, 32, 0.08);
    color: var(--text);
    border: 1.5px solid var(--bd);
    border-radius: 999px;
    padding: 13px 22px;
    font-weight: 500;
    font-size: 14px;
    cursor: pointer;
    transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), border-color 0.25s ease, background 0.25s ease, color 0.25s ease;

    &:hover {
        border-color: var(--accent2);
        background: var(--surface2);
        color: var(--accent2);
        transform: translateY(-2px) scale(1.03);
    }
}

.lk-about-footer {
    font-size: 11.5px;
    color: var(--faint);
    text-align: center;
}
</style>
