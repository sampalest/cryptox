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

// Unsigned for the alpha (matches the deferred macOS signing). NSIS installs
// per-user (no elevation) and registers the .ctx association; portable is a
// no-install exe. Windows shows a SmartScreen prompt for the unsigned build.
const win = {
    target: [
        "nsis",
        "portable"
    ],
    icon: "build/icon.ico"
};

const nsis = {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    // NSIS omits the arch by default; keep it so the x64 and arm64 installers
    // built on separate runners do not collide when merged into one release.
    artifactName: "${productName}-Setup-${version}-${arch}.${ext}"
};

const linux = {
    target: [
        "AppImage",
        "deb"
    ],
    category: "Utility",
    icon: "build/icons"
};

module.exports = {
    appId: "com.sampalest.cryptox",
    productName: "Cryptox",
    copyright: "Copyright © 2026 Samuel P.E.",
    // Each platform is built for both x64 and arm64 on native-architecture CI
    // runners; the arch in the name keeps the six artifact sets distinct when a
    // single release aggregates them all.
    artifactName: "${productName}-${version}-${arch}.${ext}",
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
        description: "Cryptox file encrypted",
        // Linux registers a real mime type from this field; mac/win ignore it.
        mimeType: "application/x-cryptox"
    },
    // APP-10: one shared fuse block on all three platforms. runAsNode, the
    // NODE_OPTIONS and inspect fuses, and onlyLoadAppFromAsar are enforced
    // everywhere. enableEmbeddedAsarIntegrityValidation is enforced only on
    // macOS (Mach-O) and Windows (PE); on Linux (ELF) it is a harmless no-op
    // while onlyLoadAppFromAsar still holds. Keep this single block so the
    // packaging hardening survives on every target.
    electronFuses: {
        runAsNode: false,
        enableNodeOptionsEnvironmentVariable: false,
        enableNodeCliInspectArguments: false,
        onlyLoadAppFromAsar: true,
        enableEmbeddedAsarIntegrityValidation: true
    },
    mac,
    win,
    nsis,
    linux
};
