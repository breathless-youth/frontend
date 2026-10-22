import ExpoModulesCore
import UIKit
import WebKit

// 웹 요소 자리에 네이티브 부품을 WKWebView 스크롤뷰 안의 부품 층에 붙인다.
// 스크롤뷰 안에 있어서 스크롤은 네이티브가 함께 움직이고, 웹은 레이아웃이 바뀔 때만 좌표를 다시 보낸다.
public class WebGlassModule: Module {
  // 탭마다 웹뷰가 따로 떠 있어서 키에 웹뷰 태그를 붙여 같은 id끼리 섞이지 않게 한다.
  private var attached: [String: UIView] = [:]
  private var layers: [Int: InlineControlLayer] = [:]
  // UIKit은 인식기 대상을 붙잡지 않아서 모듈이 웹뷰 태그마다 들고 있는다.
  private var backGestureObservers: [Int: BackGestureObserver] = [:]

  public func definition() -> ModuleDefinition {
    Name("WebGlass")
    Events("onPress", "onBackGesture")

    // 본문 부품 목록 맞추기
    //
    // 같은 종류의 부품은 뷰를 다시 써서 누르는 중인 부품이 새로 만들어지지 않게 한다.
    // 목록에 없는 부품은 삭제하고, 붙인 부품 개수를 돌려준다.
    // 웹뷰를 아직 찾지 못하면 아무것도 붙이지 않고 0을 돌려준다.
    AsyncFunction("sync") {
      (viewTag: Int, controls: [[String: Any]], hidden: Bool, palette: [String: String]) -> Int in
      // react-native-webview의 ref로는 태그를 얻을 수 없어서 감싼 View의 태그로 찾고 그 아래에서 웹뷰를 찾는다.
      guard let host = self.appContext?.findView(withTag: viewTag, ofType: UIView.self),
        let webView = findWebView(in: host)
      else {
        return 0
      }
      let scrollView = webView.scrollView
      let layer = self.inlineLayer(viewTag)
      layer.attach(to: scrollView)
      let tint = dynamicColor(light: palette["tintLight"], dark: palette["tintDark"])
      let foreground = dynamicColor(light: palette["foregroundLight"], dark: palette["foregroundDark"])
      let disabledForeground = dynamicColor(light: palette["disabledLight"], dark: palette["disabledDark"])
      var seen = Set<String>()
      for control in controls {
        guard let id = control["id"] as? String,
          let rect = documentFrame(control["frame"], zoom: scrollView.zoomScale)
        else {
          continue
        }
        let key = "\(viewTag):\(id)"
        switch control["kind"] as? String {
        case "segment":
          let segment = self.reuse(key, in: layer) { self.makeSegment(viewTag: viewTag, id: id) }
          updateSegment(segment, control, rect)
        case "switch":
          let toggle = self.reuse(key, in: layer) {
            self.makeSwitch(viewTag: viewTag, id: id, on: bool(control["on"]))
          }
          updateSwitch(toggle, control, rect, tint)
        case "button":
          let button = self.reuse(key, in: layer) { self.makeButton(viewTag: viewTag, id: id) }
          updateButton(button, control, rect, foreground, disabledForeground)
        default:
          continue
        }
        seen.insert(key)
      }
      self.remove(viewTag) { !seen.contains($0) }
      for (key, view) in self.attached where key.hasPrefix("\(viewTag):") {
        view.isHidden = hidden
      }
      return seen.count
    }.runOnQueue(.main)

    AsyncFunction("clear") { (viewTag: Int) in
      self.remove(viewTag) { _ in true }
      self.layers.removeValue(forKey: viewTag)?.detach()
      self.backGestureObservers.removeValue(forKey: viewTag)?.detach()
    }.runOnQueue(.main)

    // 본문 부품을 자르는 위쪽 선
    //
    // 부품보다 먼저 올 수 있어서 층을 먼저 만들어 값을 들고 있고, 붙일 때 그 값으로 자른다.
    AsyncFunction("setInlineClipTop") { (viewTag: Int, inset: Double) in
      self.inlineLayer(viewTag).clipTop = CGFloat(inset)
    }.runOnQueue(.main)

    // 뒤로 가기 스와이프 관찰
    //
    // 웹뷰 위 고정 층은 스와이프로 미끄러지는 웹뷰 밖에 있어서, 진행률을 받아 층을 따라 흐리게 한다.
    // WebKit은 제스처를 켤 때마다 인식기를 새로 만들어서 붙여 둔 인식기와 다를 때만 다시 붙인다.
    // 웹뷰나 인식기를 아직 찾지 못하면 아무것도 하지 않는다.
    AsyncFunction("observeBackGesture") { (viewTag: Int) in
      guard let host = self.appContext?.findView(withTag: viewTag, ofType: UIView.self),
        let webView = findWebView(in: host),
        let recognizer = backEdgeRecognizer(of: webView)
      else {
        return
      }
      if self.backGestureObservers[viewTag]?.recognizer === recognizer {
        return
      }
      self.backGestureObservers[viewTag]?.detach()
      self.backGestureObservers[viewTag] = BackGestureObserver(recognizer: recognizer) {
        [weak self] phase, progress in
        self?.sendEvent("onBackGesture", ["viewTag": viewTag, "phase": phase, "progress": progress])
      }
    }.runOnQueue(.main)
  }

  private func inlineLayer(_ viewTag: Int) -> InlineControlLayer {
    if let layer = layers[viewTag] {
      return layer
    }
    let layer = InlineControlLayer()
    layers[viewTag] = layer
    return layer
  }

  // 종류가 바뀐 부품은 새로 만들고, 층을 처음 붙였으면 그 층으로 옮긴다.
  private func reuse<T: UIView>(_ key: String, in layer: InlineControlLayer, make: () -> T) -> T {
    if let view = attached[key] as? T {
      if view.superview !== layer {
        layer.addSubview(view)
      }
      return view
    }
    attached[key]?.removeFromSuperview()
    let view = make()
    attached[key] = view
    layer.addSubview(view)
    return view
  }

  private func remove(_ viewTag: Int, where shouldRemove: (String) -> Bool) {
    let prefix = "\(viewTag):"
    for (key, view) in attached where key.hasPrefix(prefix) && shouldRemove(key) {
      view.removeFromSuperview()
      attached[key] = nil
    }
  }

  private func press(viewTag: Int, id: String) -> (Int) -> Void {
    return { [weak self] value in
      self?.sendEvent("onPress", ["viewTag": viewTag, "id": id, "value": value])
    }
  }

  private func makeSegment(viewTag: Int, id: String) -> UISegmentedControl {
    let segment = GlassSegmentedControl()
    segment.setTitleTextAttributes(
      [.font: pretendard("Pretendard-Regular", size: 13, weight: .regular)], for: .normal)
    segment.setTitleTextAttributes(
      [.font: pretendard("Pretendard-Bold", size: 13, weight: .bold)], for: .selected)
    let send = press(viewTag: viewTag, id: id)
    // 부품 자신을 붙잡으면 순환 참조가 생겨서 sender로 값을 읽는다.
    segment.addAction(
      UIAction { action in
        guard let control = action.sender as? UISegmentedControl else { return }
        send(control.selectedSegmentIndex)
      }, for: .valueChanged)
    return segment
  }

  // 처음 붙일 때는 켜지는 움직임 없이 지금 상태로 보이게 만들면서 값을 넣는다.
  private func makeSwitch(viewTag: Int, id: String, on: Bool) -> UISwitch {
    let toggle = GlassSwitch()
    toggle.isOn = on
    let send = press(viewTag: viewTag, id: id)
    toggle.addAction(
      UIAction { action in
        guard let control = action.sender as? UISwitch else { return }
        send(control.isOn ? 1 : 0)
      }, for: .valueChanged)
    return toggle
  }

  private func makeButton(viewTag: Int, id: String) -> GlassButton {
    let send = press(viewTag: viewTag, id: id)
    return GlassButton(configuration: .plain(), primaryAction: UIAction { _ in send(0) })
  }
}

// 앞으로 가기 쪽을 끄는 react-native-webview 패치와 같은 기준으로 뒤로 가기 쪽 가장자리를 고른다.
// 웹뷰에는 꺼진 가장자리 인식기도 함께 붙어 있어서 켜진 것만 본다.
private func backEdgeRecognizer(of webView: WKWebView) -> UIScreenEdgePanGestureRecognizer? {
  let backEdge: UIRectEdge =
    webView.effectiveUserInterfaceLayoutDirection == .rightToLeft ? .right : .left
  return webView.gestureRecognizers?
    .compactMap { $0 as? UIScreenEdgePanGestureRecognizer }
    .first { $0.edges == backEdge && $0.isEnabled }
}

// 뒤로 가기 가장자리 인식기의 진행 전달
//
// 손을 뗀 뒤 이동할지는 WebKit이 정하고 알려 주지 않아서 끝은 ended 하나로 보낸다.
private final class BackGestureObserver: NSObject {
  private(set) weak var recognizer: UIScreenEdgePanGestureRecognizer?
  private let emit: (String, Double) -> Void

  init(recognizer: UIScreenEdgePanGestureRecognizer, emit: @escaping (String, Double) -> Void) {
    self.recognizer = recognizer
    self.emit = emit
    super.init()
    recognizer.addTarget(self, action: #selector(handle(_:)))
  }

  func detach() {
    recognizer?.removeTarget(self, action: #selector(handle(_:)))
  }

  @objc private func handle(_ recognizer: UIScreenEdgePanGestureRecognizer) {
    guard let view = recognizer.view, view.bounds.width > 0 else {
      return
    }
    // 오른쪽 가장자리에서 시작하는 RTL은 왼쪽으로 끌어서 이동 거리의 부호를 뒤집는다.
    let direction: CGFloat = recognizer.edges == .left ? 1 : -1
    let distance = recognizer.translation(in: view).x * direction
    let progress = Double(min(max(distance / view.bounds.width, 0), 1))
    let phase: String
    switch recognizer.state {
    case .began: phase = "began"
    case .changed: phase = "changed"
    case .ended: phase = "ended"
    case .cancelled, .failed: phase = "cancelled"
    default: return
    }
    emit(phase, progress)
  }
}

// 본문 부품 층
//
// 부품은 웹뷰 안에 있어서 웹뷰 위에 떠 있는 위쪽 줄과 웹의 가장자리 흐림 밑으로 스크롤되면 그 위에 겹쳐 그려진다.
// 그래서 층을 스크롤뷰의 보이는 영역 중 자르는 선 아래에만 두고, 그 밖으로 나간 부분은 그리지도 누르지도 않는다.
// bounds 원점을 frame 원점과 같게 두어 부품 좌표는 스크롤뷰 문서 좌표 그대로 쓴다.
private final class InlineControlLayer: UIView {
  // 웹뷰 안전 영역의 위쪽 끝에서 잰 값이고 0이면 자르지 않는다.
  var clipTop: CGFloat = 0 {
    didSet { follow() }
  }
  private var offsetObservation: NSKeyValueObservation?

  override init(frame: CGRect) {
    super.init(frame: frame)
    clipsToBounds = true
  }

  required init?(coder: NSCoder) {
    return nil
  }

  // 웹뷰가 새로 만들어지면 같은 태그에서도 스크롤뷰가 바뀌어서 새 스크롤뷰로 옮기고 다시 관찰한다.
  func attach(to scrollView: UIScrollView) {
    if superview !== scrollView {
      scrollView.addSubview(self)
      offsetObservation = scrollView.observe(\.contentOffset) { [weak self] _, _ in
        self?.follow()
      }
    }
    follow()
  }

  func detach() {
    offsetObservation?.invalidate()
    offsetObservation = nil
    removeFromSuperview()
  }

  // 스크롤은 프레임마다 일어나서 값이 같으면 건드리지 않아 레이아웃을 다시 계산하지 않게 한다.
  private func follow() {
    guard let scrollView = superview as? UIScrollView else {
      return
    }
    let visible = scrollView.bounds
    // 웹의 env(safe-area-inset-top)은 WKWebView의 안전 영역이라 스크롤뷰를 감싼 웹뷰에서 읽는다.
    let safeTop = (scrollView.superview ?? scrollView).safeAreaInsets.top
    let top = clipTop > 0 ? min(safeTop + clipTop, visible.height) : 0
    let rect = CGRect(
      x: visible.minX, y: visible.minY + top, width: visible.width, height: visible.height - top)
    if frame != rect {
      frame = rect
    }
    if bounds.origin != rect.origin {
      bounds.origin = rect.origin
    }
  }

  // 부품이 없는 자리의 누름은 아래 웹으로 넘긴다.
  // 층 밖인 자르는 선 위쪽은 기본 판정이 거르므로 잘린 부품은 위쪽 줄 자리에서 눌리지 않는다.
  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    let hit = super.hitTest(point, with: event)
    return hit === self ? nil : hit
  }
}

// 웹 원본이 넓혀 둔 누름 영역은 원본과 함께 숨겨지므로 부품이 작아도 가운데 기준 44pt 안의 누름은 받는다.
private let minimumHitSide: CGFloat = 44

private func hitArea(_ bounds: CGRect) -> CGRect {
  bounds.insetBy(
    dx: min(0, (bounds.width - minimumHitSide) / 2), dy: min(0, (bounds.height - minimumHitSide) / 2))
}

private final class GlassSegmentedControl: UISegmentedControl {
  override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
    hitArea(bounds).contains(point)
  }
}

private final class GlassSwitch: UISwitch {
  override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
    hitArea(bounds).contains(point)
  }
}

private final class GlassButton: UIButton {
  // 웹은 레이아웃이 바뀔 때마다 같은 값을 다시 보내서 마지막으로 그린 입력과 같으면 모양을 다시 만들지 않는다.
  var drawnInput: [String?]?

  override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
    hitArea(bounds).contains(point)
  }
}

private func updateSegment(_ segment: UISegmentedControl, _ control: [String: Any], _ rect: CGRect) {
  let labels = control["labels"] as? [String] ?? []
  let titles = (0..<segment.numberOfSegments).map { segment.titleForSegment(at: $0) ?? "" }
  if titles != labels {
    segment.removeAllSegments()
    for (index, label) in labels.enumerated() {
      segment.insertSegment(withTitle: label, at: index, animated: false)
    }
  }
  let disabled = control["disabled"] as? [Any] ?? []
  for index in labels.indices {
    segment.setEnabled(!(index < disabled.count && bool(disabled[index])), forSegmentAt: index)
  }
  // 사용자가 막 고른 값과 같은 값을 다시 넣어 선택 표시가 흔들리지 않게 다를 때만 바꾼다.
  // 웹이 선택 없음으로 보내는 -1은 noSegment와 같은 값이라 그대로 넣어 이전 선택을 해제한다.
  if let selected = (control["selected"] as? NSNumber)?.intValue,
    selected == UISegmentedControl.noSegment || labels.indices.contains(selected),
    segment.selectedSegmentIndex != selected
  {
    segment.selectedSegmentIndex = selected
  }
  segment.accessibilityLabel = control["accessibilityLabel"] as? String
  segment.frame = rect
}

private func updateSwitch(_ toggle: UISwitch, _ control: [String: Any], _ rect: CGRect, _ tint: UIColor) {
  let on = bool(control["on"])
  if toggle.isOn != on {
    toggle.setOn(on, animated: true)
  }
  toggle.onTintColor = tint
  toggle.isEnabled = !bool(control["disabled"])
  // 모양만 보이는 스위치는 누름을 받지 않아서 아래 웹 행이 대신 눌린다.
  let interactive = bool(control["interactive"])
  toggle.isUserInteractionEnabled = interactive
  // 웹 행이 같은 상태를 읽어 주므로 VoiceOver에서도 빼서 두 번 읽히지 않고 두 번 탭이 행으로 간다.
  // UISwitch는 기본으로 접근성 요소라 숨김 표시만으로는 확실히 빠지지 않아 요소 여부도 함께 바꾼다.
  toggle.isAccessibilityElement = interactive
  toggle.accessibilityElementsHidden = !interactive
  toggle.accessibilityLabel = control["accessibilityLabel"] as? String
  // 스위치는 크기를 바꿀 수 없고 고유 폭이 웹 자리보다 넓어서 가운데에 두면 카드 모서리 쪽으로 넘친다.
  // 그래서 웹 자리의 끝 쪽 가장자리에 맞추고 세로만 가운데에 둔다.
  let size = toggle.intrinsicContentSize
  let x = toggle.effectiveUserInterfaceLayoutDirection == .rightToLeft ? rect.minX : rect.maxX - size.width
  toggle.frame = CGRect(x: x, y: rect.midY - size.height / 2, width: size.width, height: size.height)
}

private func updateButton(
  _ button: GlassButton, _ control: [String: Any], _ rect: CGRect, _ foreground: UIColor,
  _ disabledForeground: UIColor
) {
  let title = control["title"] as? String
  let systemImage = control["systemImage"] as? String
  let imageName = control["image"] as? String
  let circle = control["shape"] as? String == "circle"
  let disabled = bool(control["disabled"])
  // 색은 테마를 스스로 따르는 고정 팔레트 색이라 입력에 넣지 않는다.
  let input = [
    title, systemImage, imageName, circle ? "circle" : "capsule", disabled ? "disabled" : "enabled",
  ]
  if button.drawnInput != input {
    button.drawnInput = input
    // glass 설정은 막힌 상태에서도 글자와 아이콘을 흐리게 하지 않아서 막힌 색을 직접 넣는다.
    button.configuration = buttonConfiguration(
      title: title, systemImage: systemImage, imageName: imageName, circle: circle,
      foreground: disabled ? disabledForeground : foreground)
    // 폭은 웹 글꼴로 잰 값이라 네이티브 글자가 조금 더 넓으면 자르지 않고 줄인다.
    button.titleLabel?.adjustsFontSizeToFitWidth = true
    button.titleLabel?.minimumScaleFactor = 0.85
  }
  button.isEnabled = !disabled
  button.accessibilityLabel = control["accessibilityLabel"] as? String
  if circle {
    // 캡슐 모서리는 정사각형에서만 원이 되어서 짧은 변에 맞춘다.
    let side = min(rect.width, rect.height)
    button.frame = CGRect(x: rect.midX - side / 2, y: rect.midY - side / 2, width: side, height: side)
  } else {
    button.frame = rect
  }
}

private func buttonConfiguration(
  title: String?, systemImage: String?, imageName: String?, circle: Bool, foreground: UIColor
) -> UIButton.Configuration {
  var config: UIButton.Configuration
  if #available(iOS 26.0, *) {
    config = .glass()
  } else {
    config = .plain()
  }
  if let title {
    config.attributedTitle = AttributedString(
      title, attributes: AttributeContainer([.font: pretendard("Pretendard-Bold", size: 13, weight: .bold)]))
  }
  // 버튼 폭은 웹 원본이 정해서 글자가 넘치면 줄을 바꾸지 않고 끝을 자른다.
  config.titleLineBreakMode = .byTruncatingTail
  let image = imageName.flatMap(bundledImage) ?? systemImage.flatMap { UIImage(systemName: $0) }
  config.image = image
  // 심벌 기본 크기는 웹 아이콘보다 커서 웹 크기에 맞춰 고정한다.
  config.preferredSymbolConfigurationForImage = UIImage.SymbolConfiguration(
    pointSize: circle ? 12 : 13, weight: .semibold)
  config.imagePadding = 4
  config.cornerStyle = .capsule
  config.baseForegroundColor = foreground
  // glass 설정에서는 아이콘이 글자 색을 따르지 않아서 같은 색으로 맞춘다.
  config.imageColorTransformer = UIConfigurationColorTransformer { _ in foreground }
  // 원형 버튼은 작아서 안쪽 여백을 두면 아이콘이 밀려난다.
  config.contentInsets =
    circle
    ? .zero
    : NSDirectionalEdgeInsets(
      top: 0, leading: image == nil ? 12 : 8, bottom: 0, trailing: image == nil ? 12 : 10)
  return config
}

// 앱에 포함된 웹 아이콘 그림
//
// 웹 SVG를 검정 PNG로 렌더한 것이라 템플릿으로 읽어야 버튼 글자 색으로 칠해진다.
// 찾지 못하면 nil이라 systemImage로 그린다.
private func bundledImage(_ name: String) -> UIImage? {
  UIImage(named: name, in: resourceBundle, with: nil)?.withRenderingMode(.alwaysTemplate)
}

// podspec의 resource_bundles가 앱 안에 따로 만드는 번들이다.
private let resourceBundle: Bundle? = Bundle(for: WebGlassModule.self)
  .url(forResource: "WebGlass", withExtension: "bundle")
  .flatMap(Bundle.init(url:))

// 웹은 CSS px 문서 좌표를 보내고, 스크롤뷰 안 콘텐츠는 확대 배율만큼 커져 있다.
private func documentFrame(_ value: Any?, zoom: CGFloat) -> CGRect? {
  guard let frame = value as? [String: Any],
    let x = (frame["x"] as? NSNumber)?.doubleValue,
    let y = (frame["y"] as? NSNumber)?.doubleValue,
    let width = (frame["width"] as? NSNumber)?.doubleValue,
    let height = (frame["height"] as? NSNumber)?.doubleValue
  else {
    return nil
  }
  return CGRect(x: x, y: y, width: width, height: height).applying(CGAffineTransform(scaleX: zoom, y: zoom))
}

// JS 숫자와 불리언은 딕셔너리 안에서 Int나 Bool로 바로 캐스팅되지 않아서 NSNumber로 읽는다.
private func bool(_ value: Any?) -> Bool {
  (value as? NSNumber)?.boolValue ?? false
}

// 시스템 테마가 바뀌면 UIKit이 이 클로저를 다시 불러 라이트·다크 값을 고른다.
private func dynamicColor(light: String?, dark: String?) -> UIColor {
  let lightColor = color(hex: light) ?? .tintColor
  let darkColor = color(hex: dark) ?? lightColor
  return UIColor { traits in traits.userInterfaceStyle == .dark ? darkColor : lightColor }
}

private func color(hex: String?) -> UIColor? {
  guard let hex, hex.count == 7, hex.first == "#", let value = UInt32(hex.dropFirst(), radix: 16) else {
    return nil
  }
  return UIColor(
    red: CGFloat((value >> 16) & 0xFF) / 255,
    green: CGFloat((value >> 8) & 0xFF) / 255,
    blue: CGFloat(value & 0xFF) / 255,
    alpha: 1)
}

// 글꼴은 expo-font가 실행 중에 등록해서 아직 없으면 시스템 글꼴로 그린다.
private func pretendard(_ name: String, size: CGFloat, weight: UIFont.Weight) -> UIFont {
  UIFont(name: name, size: size) ?? .systemFont(ofSize: size, weight: weight)
}

private func findWebView(in view: UIView) -> WKWebView? {
  if let webView = view as? WKWebView {
    return webView
  }
  for child in view.subviews {
    if let found = findWebView(in: child) {
      return found
    }
  }
  return nil
}
