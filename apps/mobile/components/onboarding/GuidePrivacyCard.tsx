import { Text, View } from "react-native";

import { IllustPrivacyCamera } from "./coachIcons";
import { coachOverlay, coachRadius, coachTokenColors } from "./coachOverlayTheme";

/**
 * G5 프라이버시 카드 — Figma `privacy-card`(node 68:1351, 338×226).
 * G5에는 말풍선이 없고 이 일러스트 카드가 그 자리를 대신한다.
 *
 * **싱글룸 프라이버시 문구만 쓴다.** V1.0 화면 인벤토리에 멀티룸 화면이 없으므로
 * "AI 분석용 원본 프레임·얼굴 데이터가 서버로 전송되지 않는다" 같은 멀티룸 표현을 끌어오지
 * 않는다(루트 CLAUDE.md 개인정보 원칙 · 스펙 "싱글룸 프라이버시 문구 규율").
 *
 * Figma는 본문을 두 문장에서 강제 개행하지만 여기서는 넣지 않는다 — 그 개행 위치는 기본
 * 폰트 크기에서의 결과일 뿐이고, 폰트 확대 시 자연스럽게 다시 접히는 편이 안전하다.
 */
export function GuidePrivacyCard({ title, body }: { title: string; body: string }) {
  return (
    <View
      className="items-center gap-3 overflow-hidden border px-[18px] pb-5 pt-[22px]"
      style={{
        marginHorizontal: 32,
        backgroundColor: coachOverlay.cardBg,
        borderColor: coachOverlay.cardBorder,
        borderRadius: coachRadius.privacyCard,
        ...coachOverlay.cardShadow,
      }}
      pointerEvents="none"
    >
      <IllustPrivacyCamera />
      <Text
        accessibilityRole="header"
        className="text-center text-[16px] font-bold leading-5"
        style={{ color: coachTokenColors.cardTitle }}
      >
        {title}
      </Text>
      {/* Figma 실측 12.5px / lh18 — 표준 스케일(caption 12)에 억지로 근사하지 않는다. */}
      <Text
        className="text-center text-[12.5px] leading-[18px]"
        style={{ color: coachOverlay.cardBodyText }}
      >
        {body}
      </Text>
    </View>
  );
}
