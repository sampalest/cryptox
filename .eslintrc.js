module.exports = {
    root: true,
    env: {
        browser: true,
        node: true,
        es2022: true
    },
    "extends": [
        "plugin:vue/vue3-essential",
        "eslint:recommended"
    ],
    parser: "vue-eslint-parser",
    parserOptions: {
        parser: "@babel/eslint-parser",
        requireConfigFile: false,
        sourceType: "module"
    },
    rules: {
        "no-console": process.env.NODE_ENV === "production" ? "warn" : "off",
        "no-debugger": process.env.NODE_ENV === "production" ? "warn" : "off",
        "indent": ["error", 4],
        "linebreak-style": ["error", "unix"],
        "quotes": ["error", "double"],
        "semi": ["error", "always"],
        "no-trailing-spaces": ["error", { "skipBlankLines": true, "ignoreComments": true }]
    },
    overrides: [
        {
            files: [
                "**/__tests__/*.{j,t}s?(x)",
                "**/tests/unit/**/*.spec.{j,t}s?(x)",
                "**/tests/large/**/*.spec.{j,t}s?(x)"
            ],
            env: {
                jest: true
            }
        }
    ]
};
