const mac = {
    category: "public.app-category.utilities",
    darkModeSupport: false,
    type: "distribution",
    target: [
        "dmg",
        "zip"
    ],
    hardenedRuntime: true,
    entitlements: "build/entitlements.mac.plist",
    entitlementsInherit: "build/entitlements.mac.plist",
    gatekeeperAssess: false
};

module.exports = {
    appId: "com.sampalest.cryptox",
    productName: "Cryptox",
    copyright: "Copyright © 2026 Samuel P.E.",
    directories: {
        output: "dist_electron"
    },
    files: [
        "dist/**",
        "dist-electron/**",
        "node_modules/**",
        "package.json"
    ],
    fileAssociations: {
        ext: "ctx",
        name: "CTX",
        role: "Editor",
        description: "Cryptox file encrypted"
    },
    electronFuses: {
        runAsNode: false,
        enableNodeOptionsEnvironmentVariable: false,
        enableNodeCliInspectArguments: false,
        onlyLoadAppFromAsar: true,
        enableEmbeddedAsarIntegrityValidation: true
    },
    mac
};
