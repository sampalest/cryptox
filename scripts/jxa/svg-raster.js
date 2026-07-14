// JXA (osascript -l JavaScript). Rasterizes an SVG onto a transparent square
// canvas of side `size`, anchored on a body rect: the body's larger dimension
// targets `frac` of the canvas and the body sits as close to centered as
// possible. Nothing is ever clipped: the scale shrinks below the target when
// the full composition would overflow the canvas, and the placement is
// clamped to keep the artwork on canvas. The body rect arrives in viewBox
// units and is converted to NSImage points via the reported image width.
// NSImage is the only AppKit path that decodes SVG, so the source is loaded
// and drawn as a vector and stays crisp at any size. Do not call
// flushGraphics (undefined on the JXA proxy): drawing into the bitmap rep is
// committed synchronously. argv: inPath outPath size frac bx by bw bh vbw
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
