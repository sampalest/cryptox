<template>
    <svg v-bind="rootAttrs" aria-hidden="true" v-html="inner"></svg>
</template>
<script>
const modules = import.meta.glob("../../assets/icons/*.svg", { query: "?raw", import: "default", eager: true });

function parse(raw) {
    const openEnd = raw.indexOf(">");
    const open = raw.slice(raw.indexOf("<svg") + 4, openEnd);
    const inner = raw.slice(openEnd + 1, raw.lastIndexOf("</svg>"));
    const attrs = {};
    const re = /([a-zA-Z:-]+)\s*=\s*"([^"]*)"/g;
    let m;
    while ((m = re.exec(open)) !== null) {
        if (m[1] === "xmlns" || m[1].startsWith("xmlns:")) continue;
        attrs[m[1]] = m[2];
    }
    return { attrs, inner };
}

const REGISTRY = {};
for (const path in modules) {
    const name = path.slice(path.lastIndexOf("/") + 1, -4);
    REGISTRY[name] = parse(modules[path]);
}

export default {
    name: "lk-icon",
    props: {
        name: { type: String, required: true },
        size: { type: [Number, String], default: 16 },
        width: { type: [Number, String], default: null },
        height: { type: [Number, String], default: null }
    },
    computed: {
        icon() {
            return REGISTRY[this.name] || { attrs: {}, inner: "" };
        },
        rootAttrs() {
            return {
                ...this.icon.attrs,
                width: this.width == null ? this.size : this.width,
                height: this.height == null ? this.size : this.height
            };
        },
        inner() {
            return this.icon.inner;
        }
    }
};
</script>
