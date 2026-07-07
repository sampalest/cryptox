// APP-10/APP-12: regenerate the app and document icons.
//   build/icon.ico      multi-resolution Windows app icon (electron-builder win.icon), from public/icon.png
//   build/icons/*.png   PNG set for the Linux icon directory (electron-builder linux.icon), from public/icon.png
//   build/dino.icns     macOS .dino document icon (UTExportedTypeDeclarations)
//   build/dino.ico      Windows .dino document icon (fileAssociations default build/<ext>.ico)
//   build/ctx.icns/.ico byte copies of the dino icons, so legacy .ctx files share the artwork
// The macOS app icon build/icon.icns is generated separately and stays committed as-is.
// Document icons use the full document artwork (build/dino-document.png) at
// 128 px and up, and the plain padlock (public/icon.png) below that: the DINO
// page is illegible at list-view sizes.
// build/dino-document.png is not square, so it is first centered on a transparent
// 1024x1024 canvas (AppKit via osascript, sips cannot pad with transparency).
// This script uses macOS `sips`, `iconutil` and `osascript`, so run it on macOS;
// the generated files are committed and consumed on every platform.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appIconSource = path.join(rootDir, "public", "icon.png");
const documentSource = path.join(rootDir, "build", "dino-document.png");
const iconsDir = path.join(rootDir, "build", "icons");

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

const tempDir = mkdtempSync(path.join(os.tmpdir(), "lockasaur-icons-"));
try {
    // App icons (Windows ICO + Linux PNG set) from the square public/icon.png.
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
    const padJs = path.join(tempDir, "pad.js");
    writeFileSync(padJs, padScript);
    const master = path.join(tempDir, "dino-master.png");
    execFileSync("osascript", ["-l", "JavaScript", padJs, documentSource, master, "1024"], { stdio: "ignore" });

    // Pixel sizes below 128 render the padlock, 128 and up the document page.
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

console.log("Wrote build/icon.ico, build/icons/*.png, build/{dino,ctx}.{icns,ico}");
