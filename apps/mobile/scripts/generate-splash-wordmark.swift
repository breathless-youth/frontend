// Render "포커스 메이커스" wordmark PNGs (V2 brand colors) on transparent 1024x1024 canvas.
// V2 시안(Figma "E1 · 스플래시" 5322:3661) — NanumSquareRound ExtraBold, 브랜드색 #3671cf / #5a90ea.
// ExtraBold TTF는 웹의 woff2(apps/web/public/fonts)를 woff2_decompress로 변환해 assets/fonts에 둔다.
// 이 파일은 스플래시 자산 생성 전용이라 useFonts에 등록하지 않는다(앱 번들에 안 실린다).
// Usage: swift scripts/generate-splash-wordmark.swift <outDir>   (apps/mobile에서 실행, outDir=assets)
import AppKit
import CoreText

let outDir = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "."
let canvas: CGFloat = 1024
let targetWidth: CGFloat = 720 // wordmark width inside the canvas (한글 8자, 여백 확보)
let wordmark = "포커스 메이커스"

func brandColor(_ hex: String) -> NSColor {
    let r = CGFloat(Int(hex.dropFirst().prefix(2), radix: 16)!) / 255
    let g = CGFloat(Int(hex.dropFirst(3).prefix(2), radix: 16)!) / 255
    let b = CGFloat(Int(hex.dropFirst(5).prefix(2), radix: 16)!) / 255
    return NSColor(srgbRed: r, green: g, blue: b, alpha: 1)
}

// 저장소 TTF를 등록하고 그 PostScript 이름으로 NSFont를 만든다. 실패하면 시스템 라운드 볼드로
// 폴백해 빌드가 멈추지 않게 한다(폴백 시 로그로 알린다).
let fontPath = "assets/fonts/NanumSquareRound-ExtraBold.ttf"
var registeredFontName: String? = nil
if let url = URL(string: "file://" + FileManager.default.currentDirectoryPath + "/" + fontPath),
   let data = NSData(contentsOf: url),
   let provider = CGDataProvider(data: data),
   let cgFont = CGFont(provider) {
    CTFontManagerRegisterGraphicsFont(cgFont, nil)
    registeredFontName = cgFont.postScriptName as String?
}

func nanumFont(size: CGFloat) -> NSFont {
    if let name = registeredFontName, let f = NSFont(name: name, size: size) {
        return f
    }
    FileHandle.standardError.write("WARN: NanumSquareRound-ExtraBold 등록 실패 — 시스템 라운드 볼드로 폴백\n".data(using: .utf8)!)
    let base = NSFont.systemFont(ofSize: size, weight: .bold)
    if let desc = base.fontDescriptor.withDesign(.rounded), let f = NSFont(descriptor: desc, size: size) {
        return f
    }
    return base
}

func render(hex: String, path: String) {
    // find font size so the text fits targetWidth
    var size: CGFloat = 100
    let probeAttrs: [NSAttributedString.Key: Any] = [.font: nanumFont(size: size), .kern: size * -0.03]
    let probe = NSAttributedString(string: wordmark, attributes: probeAttrs).size()
    size = size * targetWidth / probe.width

    let attrs: [NSAttributedString.Key: Any] = [
        .font: nanumFont(size: size),
        .foregroundColor: brandColor(hex),
        .kern: size * -0.03,
    ]
    let text = NSAttributedString(string: wordmark, attributes: attrs)
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
    print("wrote \(path) fontSize=\(Int(size)) textWidth=\(Int(ts.width)) font=\(registeredFontName ?? "system-fallback")")
}

render(hex: "#3671cf", path: outDir + "/splash-icon.png")
render(hex: "#5a90ea", path: outDir + "/splash-icon-dark.png")
