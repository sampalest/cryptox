// Regenerate the app and document icons.
//   build/icon.ico                multi-resolution Windows app icon (electron-builder win.icon), from build/icon.svg
//   build/icons/*.png             PNG set for the Linux icon directory (electron-builder linux.icon), from build/icon.svg
//   public/appicons/locked.png    the "Locked" macOS Dock-icon variant (Settings picker + app:set-icon), from build/icon.svg
//   public/appicons/locked@2x.png the 1024 px retina representation of the same variant (app:set-icon 2x rep)
//   build/dino.icns               macOS .dino document icon (UTExportedTypeDeclarations)
//   build/dino.ico                Windows .dino document icon (fileAssociations default build/<ext>.ico)
//   build/ctx.icns/.ico           byte copies of the dino icons, so legacy .ctx files share the artwork
// The Windows/Linux app icon and the "locked" Dock variant are rasterized from
// the committed vector source build/icon.svg (the dino-with-keyhole tile), so
// they stay sharp at every size. The six appearance-aware macOS app-icon
// variants (build/icon.icns, build/Assets.car, public/appicons/{default,dark,
// clear-*,tinted-*}.png) are generated separately by scripts/generate-appicon.mjs
// from the Icon Composer document in design/.
// Document icons use the full document artwork (build/dino-document.png) at
// 128 px and up, and the app icon (build/icon.svg) below that: the DINO page is
// illegible at list-view sizes.
// build/icon.svg is 1749x1640 (non-square): the "Fondo App" rounded-square
// body sits at SVG_BODY within the viewBox, and the dino's head and spines
// (Aletas) overhang it on the top and left. Renders anchor the BODY rect: the
// body targets a fraction of the canvas, near-centered, and the overhang
// draws into the remaining margin. The overhang is never cut off: the scale
// backs down and the placement shifts as needed to keep every fin on canvas,
// so on Windows and Linux (no system margin, target 1) the body lands at the
// ~86% the fin overhang allows, the fins reaching the canvas edge in its
// place. build/dino-document.png is not
// square either and is centered on a transparent square canvas before
// resizing. The SVG is loaded through AppKit NSImage (osascript), the only path
// that decodes SVG, because NSBitmapImageRep.imageRepWithData (used for the
// document PNG) cannot, and sips cannot pad with transparency.
// This script uses macOS `sips`, `iconutil` and `osascript`, so run it on macOS;
// the generated files are committed and consumed on every platform.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const svgSource = path.join(rootDir, "build", "icon.svg");
const documentSource = path.join(rootDir, "build", "dino-document.png");
const iconsDir = path.join(rootDir, "build", "icons");
const appIconsDir = path.join(rootDir, "public", "appicons");

// The visible body proportion of a stock macOS 26 app icon. The "locked" Dock
// variant's BODY rect is inset to it so app.dock.setIcon renders its rounded
// square the same size as the sibling appearance variants, whose full-bleed
// exports generate-appicon.mjs insets to the same fraction. (The fins push
// past the resulting margin, so the no-clip clamp shifts the body ~2.6%
// right of center; matching the siblings' body size while keeping every fin
// visible wins over exact centering.)
const ICON_BODY_FRACTION = 0.815;

// The "Fondo App" rounded-square body of build/icon.svg, in viewBox
// coordinates (viewBox 0 0 1749 1640). Recompute if the SVG is re-exported:
// it is the on-canvas rect of the path inside the group with
// serif:id="Fondo App" after all ancestor transforms.
const SVG_BODY = { x: 219.94, y: 113.39, w: 1508, h: 1508 };

// Linux wants a range of sizes; ICO entries max out at 256 px.
const pngSizes = [16, 24, 32, 48, 64, 128, 256, 512];
const icoSizes = [16, 24, 32, 48, 64, 128, 256];

const resize = (source, size, out) =>
    execFileSync("sips", ["-z", String(size), String(size), source, "--out", out], { stdio: "ignore" });

// Pack PNGs into a Vista-style ICO (each directory entry stores raw PNG
// bytes). Header: ICONDIR (6 bytes) then one ICONDIRENTRY (16 bytes) per image,
// followed by the image blobs.
function packIco(images, icoPath) {
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0); // reserved
    header.writeUInt16LE(1, 2); // type: 1 = icon
    header.writeUInt16LE(images.length, 4); // image count

    const entries = Buffer.alloc(16 * images.length);
    let offset = header.length + entries.length;
    images.forEach((image, index) => {
        const base = index * 16;
        // A 256 px dimension is stored as 0.
        entries.writeUInt8(image.size >= 256 ? 0 : image.size, base + 0); // width
        entries.writeUInt8(image.size >= 256 ? 0 : image.size, base + 1); // height
        entries.writeUInt8(0, base + 2); // palette colors
        entries.writeUInt8(0, base + 3); // reserved
        entries.writeUInt16LE(1, base + 4); // color planes
        entries.writeUInt16LE(32, base + 6); // bits per pixel
        entries.writeUInt32LE(image.data.length, base + 8); // image byte size
        entries.writeUInt32LE(offset, base + 12); // image byte offset
        offset += image.data.length;
    });

    writeFileSync(icoPath, Buffer.concat([header, entries, ...images.map(image => image.data)]));
}

// Draws the source image centered, aspect-fit and never upscaled, on a
// transparent square canvas. AppKit selector names follow the JXA bridge
// convention (colons dropped, argument labels camel-cased into the name).
const padScript = `
ObjC.import("Cocoa");
function run(argv) {
    const inPath = argv[0], outPath = argv[1], size = parseInt(argv[2], 10);
    const data = $.NSData.dataWithContentsOfFile(inPath);
    const srcRep = $.NSBitmapImageRep.imageRepWithData(data);
    const srcW = srcRep.pixelsWide, srcH = srcRep.pixelsHigh;
    const rep = $.NSBitmapImageRep.alloc.initWithBitmapDataPlanesPixelsWidePixelsHighBitsPerSampleSamplesPerPixelHasAlphaIsPlanarColorSpaceNameBytesPerRowBitsPerPixel(
        null, size, size, 8, 4, true, false, $.NSCalibratedRGBColorSpace, 0, 0);
    $.NSGraphicsContext.setCurrentContext($.NSGraphicsContext.graphicsContextWithBitmapImageRep(rep));
    const scale = Math.min(size / srcW, size / srcH, 1);
    const w = Math.round(srcW * scale), h = Math.round(srcH * scale);
    const x = Math.round((size - w) / 2), y = Math.round((size - h) / 2);
    srcRep.drawInRectFromRectOperationFractionRespectFlippedHints(
        $.NSMakeRect(x, y, w, h), $.NSZeroRect, 2, 1.0, false, $.NSDictionary.dictionary);
    const png = rep.representationUsingTypeProperties(4, $.NSDictionary.dictionary);
    png.writeToFileAtomically(outPath, true);
}
`;

// Rasterizes the icon SVG onto a transparent square canvas of side `size`,
// anchored on its "Fondo App" body rect: the body's larger dimension targets
// `frac` of the canvas and the body sits as close to centered as possible.
// Nothing is ever clipped: the head/spine overhang must stay visible, so the
// scale shrinks below the target when the full composition would overflow
// the canvas (frac 1 therefore yields the largest body the overhang allows,
// ~86%), and the placement is clamped to keep the artwork on canvas rather
// than cutting the fins off. The body rect is passed in
// viewBox units (argv 4..8: bx by bw bh vbw), converted to NSImage points via
// the reported image width. NSImage is the only AppKit path that decodes SVG,
// so the source is loaded and drawn as a vector and stays crisp at any size;
// padScript's NSBitmapImageRep.imageRepWithData cannot read SVG. Do not call
// flushGraphics (undefined on the JXA proxy): drawing into the bitmap rep is
// committed synchronously.
const svgRasterScript = `
ObjC.import("Cocoa");
function run(argv) {
    const inPath = argv[0], outPath = argv[1], size = parseInt(argv[2], 10), frac = parseFloat(argv[3]);
    const bx = parseFloat(argv[4]), by = parseFloat(argv[5]), bw = parseFloat(argv[6]), bh = parseFloat(argv[7]);
    const vbw = parseFloat(argv[8]);
    const img = $.NSImage.alloc.initWithData($.NSData.dataWithContentsOfFile(inPath));
    if (!img || img.isNil()) throw new Error("could not load SVG");
    const srcW = img.size.width, srcH = img.size.height;
    // viewBox units to NSImage points (uniform in x and y).
    const upt = srcW / vbw;
    // points to canvas pixels: the body's larger side targets frac of the
    // canvas, shrunk if the whole composition would not fit at that scale.
    const scale = Math.min((size * frac) / (Math.max(bw, bh) * upt), size / srcW, size / srcH);
    const w = srcW * scale, h = srcH * scale;
    // Body center on the canvas center, then clamp so the composition stays
    // fully on canvas (the fins push the body slightly off-center instead of
    // getting cut). The body rect is in top-left viewBox coords; AppKit's
    // origin is bottom-left.
    const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
    const xTL = clamp(size / 2 - (bx + bw / 2) * upt * scale, 0, size - w);
    const yTL = clamp(size / 2 - (by + bh / 2) * upt * scale, 0, size - h);
    const x = xTL, y = size - (yTL + h);
    const rep = $.NSBitmapImageRep.alloc.initWithBitmapDataPlanesPixelsWidePixelsHighBitsPerSampleSamplesPerPixelHasAlphaIsPlanarColorSpaceNameBytesPerRowBitsPerPixel(
        null, size, size, 8, 4, true, false, $.NSCalibratedRGBColorSpace, 0, 0);
    $.NSGraphicsContext.setCurrentContext($.NSGraphicsContext.graphicsContextWithBitmapImageRep(rep));
    $.NSGraphicsContext.currentContext.imageInterpolation = 4;
    img.drawInRectFromRectOperationFraction($.NSMakeRect(x, y, w, h), $.NSZeroRect, 2, 1.0);
    const png = rep.representationUsingTypeProperties(4, $.NSDictionary.dictionary);
    png.writeToFileAtomically(outPath, true);
}
`;

const tempDir = mkdtempSync(path.join(os.tmpdir(), "lockasaur-icons-"));
try {
    const padJs = path.join(tempDir, "pad.js");
    writeFileSync(padJs, padScript);
    const svgJs = path.join(tempDir, "svg.js");
    writeFileSync(svgJs, svgRasterScript);
    const rasterizeSvg = (outPath, size, frac) =>
        execFileSync("osascript", [
            "-l", "JavaScript", svgJs, svgSource, outPath, String(size), String(frac),
            String(SVG_BODY.x), String(SVG_BODY.y), String(SVG_BODY.w), String(SVG_BODY.h), "1749"
        ], { stdio: "ignore" });

    // App-icon master from the vector source: Windows and Linux draw app
    // icons without a system margin, so the body targets the full canvas and
    // the renderer settles on the largest size that still keeps the fin and
    // head overhang visible. Feeds the Windows ICO, the Linux PNG set, and
    // the sub-128 document fallback.
    const appIconSource = path.join(tempDir, "app-icon-master.png");
    rasterizeSvg(appIconSource, 1024, 1);

    // The "Locked" macOS Dock variant: body inset to the icon-grid proportion
    // so it renders the same size as the appearance variants
    // generate-appicon.mjs writes. 512 px is the 1x representation the
    // Settings picker also displays; the @2x 1024 px sibling becomes the
    // retina representation app:set-icon adds to the Dock image.
    mkdirSync(appIconsDir, { recursive: true });
    rasterizeSvg(path.join(appIconsDir, "locked.png"), 512, ICON_BODY_FRACTION);
    rasterizeSvg(path.join(appIconsDir, "locked@2x.png"), 1024, ICON_BODY_FRACTION);

    // App icons (Windows ICO + Linux PNG set) from the square master.
    mkdirSync(iconsDir, { recursive: true });
    const pngFor = size => path.join(iconsDir, `${size}x${size}.png`);
    for (const size of pngSizes) {
        resize(appIconSource, size, pngFor(size));
    }
    packIco(
        icoSizes.map(size => ({ size, data: readFileSync(pngFor(size)) })),
        path.join(rootDir, "build", "icon.ico")
    );

    // Document icons from build/dino-document.png via the padded square master.
    const master = path.join(tempDir, "dino-master.png");
    execFileSync("osascript", ["-l", "JavaScript", padJs, documentSource, master, "1024"], { stdio: "ignore" });

    // Pixel sizes below 128 render the app icon, 128 and up the document page.
    const docSourceFor = pixels => (pixels < 128 ? appIconSource : master);

    // iconutil requires the canonical icon_<s>x<s>[@2x].png names and a
    // directory ending in .iconset.
    const iconsetDir = path.join(tempDir, "dino.iconset");
    mkdirSync(iconsetDir);
    for (const size of [16, 32, 128, 256, 512]) {
        resize(docSourceFor(size), size, path.join(iconsetDir, `icon_${size}x${size}.png`));
        if (size * 2 === 1024) {
            copyFileSync(master, path.join(iconsetDir, `icon_${size}x${size}@2x.png`));
        } else {
            resize(docSourceFor(size * 2), size * 2, path.join(iconsetDir, `icon_${size}x${size}@2x.png`));
        }
    }
    const dinoIcns = path.join(rootDir, "build", "dino.icns");
    execFileSync("iconutil", ["-c", "icns", iconsetDir, "-o", dinoIcns], { stdio: "inherit" });

    const docPngFor = size => path.join(tempDir, `doc-${size}.png`);
    for (const size of icoSizes) {
        resize(docSourceFor(size), size, docPngFor(size));
    }
    const dinoIco = path.join(rootDir, "build", "dino.ico");
    packIco(icoSizes.map(size => ({ size, data: readFileSync(docPngFor(size)) })), dinoIco);

    // Legacy .ctx keeps its own icon resources (the ctx UTI and the win/mac
    // fileAssociations defaults look them up by extension) but shares the
    // dino artwork.
    copyFileSync(dinoIcns, path.join(rootDir, "build", "ctx.icns"));
    copyFileSync(dinoIco, path.join(rootDir, "build", "ctx.ico"));
} finally {
    rmSync(tempDir, { recursive: true, force: true });
}

console.log("Wrote build/icon.ico, build/icons/*.png, public/appicons/locked{,@2x}.png, build/{dino,ctx}.{icns,ico}");
