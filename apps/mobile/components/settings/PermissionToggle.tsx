import { colors } from "@focuson/design-tokens";
import { useColorScheme, View } from "react-native";

/**
 * S6 설정의 카메라 권한 **표시 전용** 토글 (Figma `Control / Toggle` 43:89 — 51×31,
 * On=brand/primary, Off=#E9E9EA, 노브 27 white + 그림자).
 *
 * **React Native의 `Switch`를 쓰지 않는다**(`SCR-S6-settings.md` Components):
 *   ① 이 토글은 조작 컨트롤이 아니라 OS 권한 상태의 표시다 — 값이 바뀌지 않으므로
 *      `Switch`의 의미(값 변경)와 어긋나고, 낙관적으로 값을 뒤집으면 실제 권한과 어긋난 화면이 된다.
 *   ② `Switch`는 Android에서 Material 스위치로 렌더돼 "앱 UI는 iOS/Android 완전 공통"
 *      (`design.md` 파운데이션) 원칙과 충돌한다.
 *
 * 실제 권한 변경은 OS 설정 앱에서만 일어난다 — 탭은 부모 행이 받아 시스템 설정을 연다.
 */

const TRACK_WIDTH = 51;
const KNOB_SIZE = 27;
const KNOB_INSET = 2;

/**
 * ⚠️ Off 트랙 색만 토큰이 아니다. Figma 원본(`Control / Toggle` 43:89)이 이 값을 변수에
 * 바인딩하지 않았고(`get_variable_defs` 확인) 대응하는 시맨틱 토큰도, 다크 모드 값도 없다.
 * 근사 토큰(`bg/layer-2` #f2f4f6 · `border/strong` #d1d6db)으로 대체하면 iOS 표준 토글과
 * 다른 색이 되므로 실측값을 그대로 둔다 — 헤어라인(#EFF1F3)처럼 `border/default`로 갈음할 수 있는
 * 경우와 다르다.
 * TODO(SCR-S6-settings.md Review Checklist): 토글 Off 트랙의 다크 모드 값 확정 필요.
 */
const OFF_TRACK_COLOR = "#e9e9ea";

type PermissionToggleProps = {
  /** OS 권한 허용 여부. 이 컴포넌트는 값을 바꾸지 않는다. */
  granted: boolean;
};

export function PermissionToggle({ granted }: PermissionToggleProps) {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";

  return (
    <View
      // 상태는 행의 `accessibilityLabel`이 텍스트로 읽어준다(색상 단독 전달 금지) —
      // 그래픽까지 접근성 트리에 남으면 같은 정보가 두 번 읽힌다.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="h-[31px] w-[51px] shrink-0 justify-center rounded-full"
      style={{ backgroundColor: granted ? colors.brand.primary[scheme] : OFF_TRACK_COLOR }}
    >
      <View
        className="size-[27px] rounded-full bg-white"
        style={{
          marginLeft: granted ? TRACK_WIDTH - KNOB_INSET - KNOB_SIZE : KNOB_INSET,
          // 노브 그림자는 의미색이 아니라 깊이 표현이라 대응 토큰이 없다(S1 CTA 카드와 동일 처리).
          shadowColor: "#000000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.15,
          shadowRadius: 3,
          elevation: 2,
        }}
      />
    </View>
  );
}
