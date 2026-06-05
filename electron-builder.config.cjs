const mac = {
    category: "public.app-category.utilities",
    darkModeSupport: false,
    type: "distribution",
    target: [
        "dmg",
        "zip"
    ]
};

if (process.env.CSC_IDENTITY_AUTO_DISCOVERY !== "false") {
    mac.identity = "sampalest@icloud.com";
}

module.exports = {
    appId: "com.sampalest.cryptox",
    productName: "Cryptox",
    copyright: "Copyright © 2020 Samuel Palomo Esteban",
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
    mac
};
