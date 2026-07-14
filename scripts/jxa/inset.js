// JXA (osascript -l JavaScript). Draws the source scaled to a fraction of a
// transparent square canvas, centered, so a full-bleed export gains the
// standard macOS icon margin. sips cannot pad with transparency, so this uses
// AppKit (selector names follow the bridge convention: colons dropped,
// argument labels camel-cased). argv: inPath outPath size frac
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
