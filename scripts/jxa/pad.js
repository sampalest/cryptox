// JXA (osascript -l JavaScript). Draws the source image centered, aspect-fit
// and never upscaled, on a transparent square canvas. AppKit selector names
// follow the JXA bridge convention (colons dropped, argument labels
// camel-cased into the name). argv: inPath outPath size
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
