import AVFoundation
import ExpoModulesCore
import UIKit

// 릴스는 3초보다 짧은 영상을 받지 않는다.
private let minReelsSeconds = 3.0
// 인스타그램이 열리며 꺼내 갈 시간만 남기고 보관함에서 사라지게 한다.
private let pasteboardLifetime: TimeInterval = 5 * 60

public class DirectShareModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DirectShare")

    // 인스타그램 릴스 편집 화면 열기
    //
    // 인스타그램은 붙여넣기 보관함에서 영상과 Meta 앱 ID를 꺼내 간다.
    // 보관함 항목은 다른 기기와 동기화하지 않고 5분 뒤 사라진다.
    AsyncFunction("shareToInstagramReels") { (uri: URL, appId: String) async -> Bool in
      guard let target = URL(string: "instagram-reels://share") else {
        return false
      }
      guard await UIApplication.shared.canOpenURL(target) else {
        return false
      }
      guard let duration = try? await AVURLAsset(url: uri).load(.duration),
        duration.seconds >= minReelsSeconds
      else {
        return false
      }
      guard let video = try? Data(contentsOf: uri) else {
        return false
      }
      await MainActor.run {
        UIPasteboard.general.setItems(
          [[
            "com.instagram.sharedSticker.backgroundVideo": video,
            "com.instagram.sharedSticker.appID": appId,
          ]],
          options: [
            .localOnly: true,
            .expirationDate: Date().addingTimeInterval(pasteboardLifetime),
          ]
        )
      }
      if await UIApplication.shared.open(target) {
        return true
      }
      // 열지 못하면 공유 시트로 돌아간 뒤에도 영상이 5분 동안 보관함에 남지 않게 비운다.
      await MainActor.run {
        UIPasteboard.general.items = []
      }
      return false
    }
  }
}
