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
    gatekeeperAssess: false,
    // CTX-17: appearance-aware app icon. Assets.car is compiled from the Icon
    // Composer document by scripts/generate-appicon.mjs and carries the real
    // Dark/Clear/Tinted variants macOS 26+ renders; CFBundleIconName (in
    // extendInfo below) points at its "AppIcon" entry. Older macOS ignores the
    // key and falls back to build/icon.icns (CFBundleIconFile).
    extraResources: [
        { from: "build/Assets.car", to: "Assets.car" }
    ],
    // APP-12: electron-builder's fileAssociations only emit CFBundleTypeExtensions,
    // which modern macOS does not resolve to a real type for a custom extension
    // (Finder shows the generic document icon). Declare exported UTIs so the OS
    // knows the .dino/.ctx types and attaches their icons (matched by extension
    // to the CFBundleDocumentTypes' CFBundleTypeIconFile). extendInfo merges into
    // the generated Info.plist.
    extendInfo: {
        // Must match the icon name compiled into Assets.car (the staged
        // AppIcon.icon name in scripts/generate-appicon.mjs).
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
                // The UTI identifier shipped with the pre-rebrand releases; kept
                // stable so LaunchServices does not accumulate a second UTI for .ctx.
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

// APP-11: electron-builder's default deb depends list omits libasound2, but the
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
    // APP-11: build AppImages with the static (type2, runtime 20251108) launcher
    // toolset. The default legacy toolset ("0.0.0") embeds a dynamically linked
    // launcher whose arm64 build links an unversioned libz.so, so the arm64
    // AppImage could not start on stock Ubuntu (reproduced on 24.04 arm64). The
    // "1.0.2" toolset's runtimes are static-pie with no dynamic dependencies and
    // use fusermount3 (a default install on Ubuntu 24.04) instead of libfuse2.
    // The download is checksum-pinned inside app-builder-lib.
    toolsets: {
        appimage: "1.0.2"
    },
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
    // APP-12: .dino is the extension Lockasaur writes; the legacy .ctx
    // association stays so double-clicking files from pre-rebrand releases
    // still opens the app (decrypt-only compatibility). Association icons are
    // found by extension: macOS defaults to build/<ext>.icns, Windows to
    // build/<ext>.ico. All four (dino/ctx, icns/ico) are generated by
    // scripts/generate-icons.mjs from the document artwork.
    fileAssociations: [
        {
            ext: "dino",
            name: "DINO",
            role: "Editor",
            description: "Lockasaur encrypted file",
            // Linux registers a real mime type from this field; mac/win ignore it.
            mimeType: "application/x-lockasaur"
        },
        {
            ext: "ctx",
            name: "CTX",
            role: "Editor",
            description: "Lockasaur legacy encrypted file",
            // The mime type registered by the pre-rebrand releases; kept stable.
            mimeType: "application/x-cryptox"
        }
    ],
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
    dmg,
    win,
    nsis,
    linux,
    deb
};
