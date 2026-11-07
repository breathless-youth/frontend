const fs = require("fs");
const path = require("path");
const { withDangerousMod } = require("expo/config-plugins");

const SOURCE = "assets/notification-icon.png";

/**
 * Android 상태 표시줄 알림 아이콘 리소스
 *
 * FCM 알림은 Manifest의 `default_notification_icon`이 가리키는 `@drawable/notification_icon`을 쓴다.
 * 그 항목은 `@react-native-firebase/messaging` 플러그인이 넣지만, 그림 파일은 expo-notifications가 있어야 만들어져서 여기서 직접 복사한다.
 * Android는 알림 아이콘의 알파만 쓰므로 원본은 투명 배경 위 흰 실루엣이어야 하고, 아니면 네모로 보인다.
 * 24dp 아이콘의 xxxhdpi 크기(96px) 한 장만 두면 낮은 밀도는 시스템이 줄여 쓴다.
 */
module.exports = function withNotificationIcon(config) {
  return withDangerousMod(config, [
    "android",
    async (cfg) => {
      const from = path.join(cfg.modRequest.projectRoot, SOURCE);
      const dir = path.join(
        cfg.modRequest.platformProjectRoot,
        "app/src/main/res/drawable-xxxhdpi",
      );
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(from, path.join(dir, "notification_icon.png"));
      return cfg;
    },
  ]);
};
