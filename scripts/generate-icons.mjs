// APP-10: regenerate the Windows and Linux app icons from public/icon.png.
//   build/icon.ico      multi-resolution Windows icon (electron-builder win.icon)
//   build/icons/*.png   PNG set for the Linux icon directory (electron-builder linux.icon)
// The macOS build/icon.icns and build/ctx.icns are generated separately and stay
// committed as-is. This script uses macOS `sips` to resize, so run it on macOS;
// the generated .ico and .png files are committed and consumed on every platform.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(rootDir, "public", "icon.png");
const iconsDir = path.join(rootDir, "build", "icons");
const icoPath = path.join(rootDir, "build", "icon.ico");

// Linux wants a range of sizes; ICO entries max out at 256 px.
const pngSizes = [16, 24, 32, 48, 64, 128, 256, 512];
const icoSizes = [16, 24, 32, 48, 64, 128, 256];

mkdirSync(iconsDir, { recursive: true });

const pngFor = size => path.join(iconsDir, `${size}x${size}.png`);

for (const size of pngSizes) {
    execFileSync("sips", ["-z", String(size), String(size), source, "--out", pngFor(size)], { stdio: "inherit" });
}

// Pack the PNGs into a Vista-style ICO (each directory entry stores raw PNG
// bytes). Header: ICONDIR (6 bytes) then one ICONDIRENTRY (16 bytes) per image,
// followed by the image blobs.
const images = icoSizes.map(size => ({ size, data: readFileSync(pngFor(size)) }));

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

console.log(`Wrote ${icoPath} and ${pngSizes.length} PNGs to ${iconsDir}`);
