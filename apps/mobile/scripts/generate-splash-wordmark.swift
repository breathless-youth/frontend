// Render splash PNGs (Timi mascot above the wordmark, V2 brand colors) on transparent 1024x1024 canvas.
// V2 시안(Figma "E1 · 스플래시" 5322:3661)의 브랜드색 #3671cf / #5a90ea, 글꼴은 Pretendard ExtraBold.
// 글꼴 파일은 pretendard 패키지의 정적 OTF를 그대로 읽는다. 앱에서 쓰는 폰트와 원본을 한 곳으로 모으기 위해서다.
// Usage: swift scripts/generate-splash-wordmark.swift <outDir>   (apps/mobile에서 실행, outDir=assets)
import AppKit
import CoreText

let outDir = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "."
let canvas: CGFloat = 1024
// 타이미 높이, 타이미와 워드마크 사이 간격, 한글 워드마크 폭은 시안의 pt 값이다.
let mascotHeight: CGFloat = 96
let mascotGap: CGFloat = 20
let wordmarkWidth: CGFloat = 195
guard let mascot = NSImage(contentsOfFile: "assets/mascot/timi-default.png"),
      let mascotRep = mascot.representations.first else { fatalError("timi-default.png 읽기 실패") }
let mascotWidth = mascotHeight * CGFloat(mascotRep.pixelsWide) / CGFloat(mascotRep.pixelsHigh)
// 기본은 영어 워드마크이고, 한국어 기기만 한글 워드마크를 쓴다(BY-1181, plugins/withKoreanSplash.js).

func brandColor(_ hex: String) -> NSColor {
    let r = CGFloat(Int(hex.dropFirst().prefix(2), radix: 16)!) / 255
    let g = CGFloat(Int(hex.dropFirst(3).prefix(2), radix: 16)!) / 255
    let b = CGFloat(Int(hex.dropFirst(5).prefix(2), radix: 16)!) / 255
    return NSColor(srgbRed: r, green: g, blue: b, alpha: 1)
}

// 글꼴 파일을 등록하고 그 PostScript 이름으로 NSFont를 만든다. 실패하면 시스템 라운드 볼드로
// 폴백해 빌드가 멈추지 않게 한다(폴백 시 로그로 알린다).
// 워크스페이스 루트 node_modules에 호이스트돼 있다(apps/mobile에서 실행하는 기준).
let fontPath = "../../node_modules/pretendard/dist/public/static/Pretendard-ExtraBold.otf"
var registeredFontName: String? = nil
// cwd에 #·%·공백 등 URL 예약 문자가 있어도 안전하게 — URL(string:)이 아니라 파일 경로 API를 쓴다.
let fontURL = URL(fileURLWithPath: FileManager.default.currentDirectoryPath).appendingPathComponent(fontPath)
if let data = NSData(contentsOf: fontURL),
   let provider = CGDataProvider(data: data),
   let cgFont = CGFont(provider) {
    CTFontManagerRegisterGraphicsFont(cgFont, nil)
    registeredFontName = cgFont.postScriptName as String?
}

func wordmarkFont(size: CGFloat) -> NSFont {
    if let name = registeredFontName, let f = NSFont(name: name, size: size) {
        return f
    }
    FileHandle.standardError.write("WARN: Pretendard-ExtraBold 등록 실패, 시스템 라운드 볼드로 폴백\n".data(using: .utf8)!)
    let base = NSFont.systemFont(ofSize: size, weight: .bold)
    if let desc = base.fontDescriptor.withDesign(.rounded), let f = NSFont(descriptor: desc, size: size) {
        return f
    }
    return base
}

func wordmarkText(_ wordmark: String, hex: String, width: CGFloat) -> NSAttributedString {
    // 폭을 맞추려고 100pt로 한 번 재서 비례로 크기를 정한다.
    let probe = NSAttributedString(string: wordmark, attributes: [.font: wordmarkFont(size: 100), .kern: -3.0]).size()
    let size = 100 * width / probe.width
    return NSAttributedString(string: wordmark, attributes: [
        .font: wordmarkFont(size: size),
        .foregroundColor: brandColor(hex),
        .kern: size * -0.03,
    ])
}

/// 타이미와 워드마크 묶음의 pt 크기
func bundleSize(_ wordmark: String) -> CGSize {
    let text = wordmarkText(wordmark, hex: "#000000", width: wordmarkWidth).size()
    return CGSize(width: max(text.width, mascotWidth), height: mascotHeight + mascotGap + text.height)
}

// Android 12 이상은 288dp 스플래시 아이콘을 지름 192dp 원으로 잘라서, 묶음 모서리가 반지름 96dp 안에 들도록 pt당 픽셀 배율을 정한다.
// 캔버스는 imageWidth dp로 그려지므로 app.json의 expo-splash-screen 값을 그대로 읽는다.
let appJSON = try! JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: "app.json"))) as! [String: Any]
let splashOptions = ((appJSON["expo"] as! [String: Any])["plugins"] as! [Any])
    .compactMap { $0 as? [Any] }
    .first { $0.first as? String == "expo-splash-screen" }![1] as! [String: Any]
let imageWidth = CGFloat((splashOptions["imageWidth"] as! NSNumber).doubleValue)
let maskRadius = 96 * canvas / imageWidth
let wordmarks = ["FocusMakers", "포커스 메이커스"]
let pointScale = wordmarks
    .map { bundleSize($0) }
    .map { maskRadius / hypot($0.width / 2, $0.height / 2) }
    .min()!

func render(_ wordmark: String, hex: String, path: String) {
    let text = wordmarkText(wordmark, hex: hex, width: wordmarkWidth * pointScale)
    let ts = text.size()
    let bundleHeight = bundleSize(wordmark).height * pointScale
    let top = (canvas + bundleHeight) / 2

    guard let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil, pixelsWide: Int(canvas), pixelsHigh: Int(canvas),
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .calibratedRGB, bytesPerRow: 0, bitsPerPixel: 0
    ) else { fatalError("rep failed") }
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    NSGraphicsContext.current?.imageInterpolation = .high
    let mascotSize = NSSize(width: mascotWidth * pointScale, height: mascotHeight * pointScale)
    mascot.draw(in: NSRect(
        x: (canvas - mascotSize.width) / 2, y: top - mascotSize.height,
        width: mascotSize.width, height: mascotSize.height
    ))
    text.draw(at: NSPoint(x: (canvas - ts.width) / 2, y: top - bundleHeight))
    NSGraphicsContext.restoreGraphicsState()

    guard let png = rep.representation(using: .png, properties: [:]) else {
        fatalError("encode failed")
    }
    try! png.write(to: URL(fileURLWithPath: path))
    print("wrote \(path) pointScale=\(pointScale) bundle=\(Int(bundleSize(wordmark).width * pointScale))x\(Int(bundleHeight))px font=\(registeredFontName ?? "system-fallback")")
}

render(wordmarks[0], hex: "#3671cf", path: outDir + "/splash-icon.png")
render(wordmarks[0], hex: "#5a90ea", path: outDir + "/splash-icon-dark.png")
render(wordmarks[1], hex: "#3671cf", path: outDir + "/splash-icon-ko.png")
render(wordmarks[1], hex: "#5a90ea", path: outDir + "/splash-icon-ko-dark.png")
