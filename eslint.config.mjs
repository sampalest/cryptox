import js from "@eslint/js";
import pluginVue from "eslint-plugin-vue";
import globals from "globals";

export default [
    {
        ignores: ["dist/**", "dist-electron/**", "dist_electron/**", "node_modules/**", "coverage/**"]
    },
    js.configs.recommended,
    ...pluginVue.configs["flat/essential"],
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                ...globals.browser,
                ...globals.node,
                ...globals.es2022,
                // Injected at build time by the Vite define in vite.config.js.
                "__APP_VERSION__": "readonly"
            }
        },
        rules: {
            "no-console": process.env.NODE_ENV === "production" ? "warn" : "off",
            "no-debugger": process.env.NODE_ENV === "production" ? "warn" : "off",
            "indent": ["error", 4],
            "linebreak-style": ["error", "unix"],
            "quotes": ["error", "double"],
            "semi": ["error", "always"],
            "no-trailing-spaces": ["error", { "skipBlankLines": true, "ignoreComments": true }]
        }
    },
    {
        files: [
            "**/__tests__/*.{j,t}s?(x)",
            "**/tests/unit/**/*.spec.{j,t}s?(x)",
            "**/tests/large/**/*.spec.{j,t}s?(x)"
        ],
        languageOptions: {
            globals: {
                ...globals.jest
            }
        }
    }
];
