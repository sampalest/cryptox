// CTX-17: regenerate the macOS app icon set from the Icon Composer document.
//   build/icon.icns        full-resolution fallback app icon (CFBundleIconFile) for macOS < 26,
//                          built from the Default appearance export
//   build/Assets.car       compiled appearance-aware icon (CFBundleIconName "AppIcon"), the icon
//                          macOS 26+ renders with real Dark/Clear/Tinted variants
//   public/appicons/*.png  512 px appearance variants consumed at runtime by the Settings
//                          icon picker and the app:set-icon dock icon handler
// Inputs live under design/ (local only, gitignored): design/lockasaur_icon_v2.icon plus the
// 1024 px Icon Composer exports in "design/lockasaur_icon_v2 Exports". Requires macOS with a
// full Xcode 26+ install (actool understands .icon documents), iconutil and sips; the generated
// outputs are committed and consumed on every platform.
import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const iconDocument = path.join(rootDir, "design", "lockasaur_icon_v2.icon");
const exportsDir = path.join(rootDir, "design", "lockasaur_icon_v2 Exports");
const exportFor = variant => path.join(exportsDir, `lockasaur_icon_v2-macOS-${variant}-1024x1024@1x.png`);

// Appearance export -> the icon id used by public/appicons, ipcValidation's
// APP_ICON_IDS allowlist and the renderer picker. Keep the three in sync.
const variants = [
    ["Default", "default"],
    ["Dark", "dark"],
    ["ClearLight", "clear-light"],
    ["ClearDark", "clear-dark"],
    ["TintedLight", "tinted-light"],
    ["TintedDark", "tinted-dark"]
];

for (const required of [iconDocument, ...variants.map(([variant]) => exportFor(variant))]) {
    if (!existsSync(required)) {
        throw new Error(`Missing input: ${required}`);
    }
}

const resize = (source, size, out) =>
    execFileSync("sips", ["-z", String(size), String(size), source, "--out", out], { stdio: "ignore" });

// actool ships only with full Xcode. xcode-select may still point at the
// CommandLineTools, so fall back to the default Xcode.app location before
// giving up.
function actoolEnv() {
    for (const developerDir of [undefined, "/Applications/Xcode.app"]) {
        const env = developerDir ? { ...process.env, DEVELOPER_DIR: developerDir } : process.env;
        try {
            execFileSync("xcrun", ["--find", "actool"], { env, stdio: "ignore" });
            return env;
        } catch {
            // Try the next location.
        }
    }
    throw new Error("actool was not found. Install full Xcode 26+ (Icon Composer .icon support).");
}

const tempDir = mkdtempSync(path.join(os.tmpdir(), "lockasaur-appicon-"));
try {
    // Fallback icns from the Default export. iconutil requires the canonical
    // icon_<s>x<s>[@2x].png names and a directory ending in .iconset.
    const iconsetDir = path.join(tempDir, "app.iconset");
    mkdirSync(iconsetDir);
    const defaultExport = exportFor("Default");
    for (const size of [16, 32, 128, 256, 512]) {
        resize(defaultExport, size, path.join(iconsetDir, `icon_${size}x${size}.png`));
        if (size * 2 === 1024) {
            copyFileSync(defaultExport, path.join(iconsetDir, `icon_${size}x${size}@2x.png`));
        } else {
            resize(defaultExport, size * 2, path.join(iconsetDir, `icon_${size}x${size}@2x.png`));
        }
    }
    execFileSync("iconutil", ["-c", "icns", iconsetDir, "-o", path.join(rootDir, "build", "icon.icns")], { stdio: "inherit" });

    // Appearance-aware icon: compile the .icon document into Assets.car. The
    // staged copy is named AppIcon.icon because the file name becomes the icon
    // name inside the car, which CFBundleIconName must match. actool also emits
    // a thin AppIcon.icns (16/128 px only); the iconutil fallback above is kept
    // instead.
    const stagedIcon = path.join(tempDir, "AppIcon.icon");
    cpSync(iconDocument, stagedIcon, { recursive: true });
    const actoolOut = path.join(tempDir, "actool-out");
    mkdirSync(actoolOut);
    execFileSync("xcrun", [
        "actool", stagedIcon,
        "--compile", actoolOut,
        "--platform", "macosx",
        "--minimum-deployment-target", "11.0",
        "--app-icon", "AppIcon",
        "--include-all-app-icons",
        "--output-partial-info-plist", path.join(actoolOut, "partial.plist"),
        "--output-format", "human-readable-text"
    ], { env: actoolEnv(), stdio: "inherit" });
    const compiledCar = path.join(actoolOut, "Assets.car");
    if (!existsSync(compiledCar) || !readFileSync(path.join(actoolOut, "partial.plist"), "utf8").includes("AppIcon")) {
        throw new Error("actool did not produce an AppIcon Assets.car.");
    }
    copyFileSync(compiledCar, path.join(rootDir, "build", "Assets.car"));

    // Runtime picker variants. 512 px keeps the bundle small while staying
    // sharp at every Dock size (128 pt @2x plus magnification headroom).
    const appIconsDir = path.join(rootDir, "public", "appicons");
    mkdirSync(appIconsDir, { recursive: true });
    for (const [variant, id] of variants) {
        resize(exportFor(variant), 512, path.join(appIconsDir, `${id}.png`));
    }
} finally {
    rmSync(tempDir, { recursive: true, force: true });
}

console.log("Wrote build/icon.icns, build/Assets.car, public/appicons/*.png");
