// Render "FocusMakers" wordmark PNGs (light/dark brand colors) on transparent 1024x1024 canvas.
// Usage: swift gen-wordmark.swift <outDir>
import AppKit

let outDir = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "."
let canvas: CGFloat = 1024
let targetWidth: CGFloat = 900 // wordmark width inside the canvas

func brandColor(_ hex: String) -> NSColor {
    let r = CGFloat(Int(hex.dropFirst().prefix(2), radix: 16)!) / 255
    let g = CGFloat(Int(hex.dropFirst(3).prefix(2), radix: 16)!) / 255
    let b = CGFloat(Int(hex.dropFirst(5).prefix(2), radix: 16)!) / 255
    return NSColor(srgbRed: r, green: g, blue: b, alpha: 1)
}

func roundedBoldFont(size: CGFloat) -> NSFont {
    let base = NSFont.systemFont(ofSize: size, weight: .bold)
    if let desc = base.fontDescriptor.withDesign(.rounded), let f = NSFont(descriptor: desc, size: size) {
        return f
    }
    return base
}

func render(hex: String, path: String) {
    // find font size so the text fits targetWidth
    var size: CGFloat = 100
    let probeAttrs: [NSAttributedString.Key: Any] = [.font: roundedBoldFont(size: size), .kern: size * -0.02]
    let probe = NSAttributedString(string: "FocusMakers", attributes: probeAttrs).size()
    size = size * targetWidth / probe.width

    let attrs: [NSAttributedString.Key: Any] = [
        .font: roundedBoldFont(size: size),
        .foregroundColor: brandColor(hex),
        .kern: size * -0.02,
    ]
    let text = NSAttributedString(string: "FocusMakers", attributes: attrs)
    let ts = text.size()

    guard let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil, pixelsWide: Int(canvas), pixelsHigh: Int(canvas),
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .calibratedRGB, bytesPerRow: 0, bitsPerPixel: 0
    ) else { fatalError("rep failed") }
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    text.draw(at: NSPoint(x: (canvas - ts.width) / 2, y: (canvas - ts.height) / 2))
    NSGraphicsContext.restoreGraphicsState()

    guard let png = rep.representation(using: .png, properties: [:]) else {
        fatalError("encode failed")
    }
    try! png.write(to: URL(fileURLWithPath: path))
    print("wrote \(path) fontSize=\(Int(size)) textWidth=\(Int(ts.width))")
}

render(hex: "#1b64da", path: outDir + "/mark-e-light.png")
render(hex: "#3182f6", path: outDir + "/mark-e-dark.png")
