const mac = {
    category: "public.app-category.utilities",
    darkModeSupport: false,
    type: "distribution",
    target: [
        "dmg"
    ],
    hardenedRuntime: true,
    entitlements: "build/entitlements.mac.plist",
    entitlementsInherit: "build/entitlements.mac.plist",
    gatekeeperAssess: false,
    extraResources: [
        { from: "build/Assets.car", to: "Assets.car" }
    ],
    extendInfo: {
        CFBundleIconName: "AppIcon",
        UTExportedTypeDeclarations: [
            {
                UTTypeIdentifier: "com.sampalest.lockasaur.dino",
                UTTypeDescription: "Lockasaur encrypted file",
                UTTypeConformsTo: ["public.data"],
                UTTypeTagSpecification: {
                    "public.filename-extension": ["dino"]
                },
                UTTypeIconFile: "dino.icns",
                UTTypeIconFiles: ["dino.icns"]
            },
            {
                UTTypeIdentifier: "com.sampalest.cryptox.ctx",
                UTTypeDescription: "Lockasaur legacy encrypted file",
                UTTypeConformsTo: ["public.data"],
                UTTypeTagSpecification: {
                    "public.filename-extension": ["ctx"]
                },
                UTTypeIconFile: "ctx.icns",
                UTTypeIconFiles: ["ctx.icns"]
            }
        ]
    }
};

const dmg = {
    background: "build/dmg_background.jpg",
    window: {
        width: 900,
        height: 600
    },
    contents: [
        {
            x: 222,
            y: 328,
            type: "file"
        },
        {
            x: 735,
            y: 328,
            type: "link",
            path: "/Applications"
        }
    ]
};

// Unsigned for the alpha (matches the deferred macOS signing). NSIS installs
// per-user (no elevation) and registers the .dino/.ctx associations. Windows
// shows a SmartScreen prompt for the unsigned build.
const win = {
    target: [
        "nsis"
    ],
    icon: "build/icon.ico"
};

const nsis = {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    differentialPackage: false,
    useZip: true
};

const linux = {
    target: [
        "deb"
    ],
    category: "Utility",
    icon: "build/icons"
};

// electron-builder's default deb depends list omits libasound2, but the
// Electron binary links libasound.so.2 at load time, so the installed app died
// on any Ubuntu without the desktop audio stack (reproduced on Ubuntu 24.04
// arm64). Overriding depends replaces the default list, so it is repeated here
// with libasound2 appended (on Ubuntu 24.04 the libasound2t64 package provides
// it). Keep this list in sync with FpmTarget.getDefaultDepends when bumping
// electron-builder.
const deb = {
    depends: [
        "libgtk-3-0",
        "libnotify4",
        "libnss3",
        "libxss1",
        "libxtst6",
        "xdg-utils",
        "libatspi2.0-0",
        "libuuid1",
        "libsecret-1-0",
        "libasound2"
    ]
};

module.exports = {
    appId: "com.sampalest.lockasaur",
    productName: "Lockasaur",
    toolsets: {
        appimage: "1.0.2"
    },
    copyright: "Copyright © 2026 Sampalest",
    artifactName: "${productName}-${arch}.${ext}",
    directories: {
        output: "dist_electron"
    },
    files: [
        "dist/**",
        "dist-electron/**",
        "node_modules/**",
        "package.json"
    ],
    fileAssociations: [
        {
            ext: "dino",
            name: "DINO",
            role: "Editor",
            description: "Lockasaur encrypted file",
            mimeType: "application/x-lockasaur"
        },
        {
            ext: "ctx",
            name: "CTX",
            role: "Editor",
            description: "Lockasaur legacy encrypted file",
            mimeType: "application/x-cryptox"
        }
    ],
    electronFuses: {
        runAsNode: false,
        enableNodeOptionsEnvironmentVariable: false,
        enableNodeCliInspectArguments: false,
        onlyLoadAppFromAsar: true,
        enableEmbeddedAsarIntegrityValidation: true
    },
    mac,
    dmg,
    win,
    nsis,
    linux,
    deb
};
