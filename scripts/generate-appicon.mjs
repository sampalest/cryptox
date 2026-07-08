// CTX-17: regenerate the macOS app icon set from the Icon Composer document.
//   build/icon.icns        full-resolution fallback app icon (CFBundleIconFile) for macOS < 26,
//                          built from the Default appearance export
//   build/Assets.car       compiled appearance-aware icon (CFBundleIconName "AppIcon"), the icon
//                          macOS 26+ renders with real Dark/Clear/Tinted variants
//   public/appicons/*.png  appearance variants consumed at runtime: <id>.png (512 px) feeds the
//                          Settings icon picker and the 1x Dock representation, <id>@2x.png
//                          (1024 px) the retina Dock representation. app:set-icon combines the
//                          pair into one multi-representation NativeImage, the closest Electron
//                          gets to an .icns (nativeImage cannot decode .icns files).
// Inputs live under design/ (local only, gitignored): design/lockasaur_icon_v2.icon plus the
// 1024 px Icon Composer exports in "design/lockasaur_icon_v2 Exports". Requires macOS with a
// full Xcode 26+ install (actool understands .icon documents), iconutil and sips; the generated
// outputs are committed and consumed on every platform.
//
// The Icon Composer exports are full-bleed: the rounded-square body fills the whole 1024 canvas.
// macOS renders the app's own icon (from Assets.car/icns) inside its standard icon grid, insetting
// the body, but app.dock.setIcon shows a raw PNG as-is and fills the Dock tile with it, so a
// full-bleed PNG lands ~23% larger than neighboring apps. The runtime variants are therefore
// inset to ICON_BODY_FRACTION (the body proportion measured off stock macOS 26 app icons: Notes,
// Maps and Reminders all sit at ~81% of the canvas with a ~9.4% transparent margin), so the Dock
// icon matches the system. The icns/Assets.car keep the full-bleed art (macOS insets those itself).
import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

// The visible body proportion of a stock macOS 26 app icon (measured off Notes,
// Maps and Reminders: body ~81.3% of the canvas, ~9.4% margin each side).
const ICON_BODY_FRACTION = 0.815;

const resize = (source, size, out) =>
    execFileSync("sips", ["-z", String(size), String(size), source, "--out", out], { stdio: "ignore" });

// Draws the source scaled to ICON_BODY_FRACTION of a transparent square canvas,
// centered, so a full-bleed export gains the standard macOS icon margin. sips
// cannot pad with transparency, so this uses AppKit via JXA (selector names
// follow the bridge convention: colons dropped, argument labels camel-cased).
const insetScript = `
ObjC.import("Cocoa");
function run(argv) {
    const inPath = argv[0], outPath = argv[1], size = parseInt(argv[2], 10), frac = parseFloat(argv[3]);
    const data = $.NSData.dataWithContentsOfFile(inPath);
    const srcRep = $.NSBitmapImageRep.imageRepWithData(data);
    const srcW = srcRep.pixelsWide, srcH = srcRep.pixelsHigh;
    const rep = $.NSBitmapImageRep.alloc.initWithBitmapDataPlanesPixelsWidePixelsHighBitsPerSampleSamplesPerPixelHasAlphaIsPlanarColorSpaceNameBytesPerRowBitsPerPixel(
        null, size, size, 8, 4, true, false, $.NSCalibratedRGBColorSpace, 0, 0);
    $.NSGraphicsContext.setCurrentContext($.NSGraphicsContext.graphicsContextWithBitmapImageRep(rep));
    const body = Math.round(size * frac);
    const scale = Math.min(body / srcW, body / srcH);
    const w = Math.round(srcW * scale), h = Math.round(srcH * scale);
    const x = Math.round((size - w) / 2), y = Math.round((size - h) / 2);
    srcRep.drawInRectFromRectOperationFractionRespectFlippedHints(
        $.NSMakeRect(x, y, w, h), $.NSZeroRect, 2, 1.0, false, $.NSDictionary.dictionary);
    const png = rep.representationUsingTypeProperties(4, $.NSDictionary.dictionary);
    png.writeToFileAtomically(outPath, true);
}
`;

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

    // Runtime picker/dock variants, inset to the system icon grid (see the
    // header note). The 512 px 1x file feeds the Settings picker and standard
    // displays; the 1024 px @2x file is the retina representation, matching
    // the largest rep an .icns would carry (512 pt @2x).
    const insetJs = path.join(tempDir, "inset.js");
    writeFileSync(insetJs, insetScript);
    const appIconsDir = path.join(rootDir, "public", "appicons");
    mkdirSync(appIconsDir, { recursive: true });
    for (const [variant, id] of variants) {
        for (const [suffix, pixels] of [["", "512"], ["@2x", "1024"]]) {
            execFileSync("osascript", [
                "-l", "JavaScript", insetJs,
                exportFor(variant), path.join(appIconsDir, `${id}${suffix}.png`), pixels, String(ICON_BODY_FRACTION)
            ], { stdio: "ignore" });
        }
    }
} finally {
    rmSync(tempDir, { recursive: true, force: true });
}

console.log("Wrote build/icon.icns, build/Assets.car, public/appicons/*.png");
