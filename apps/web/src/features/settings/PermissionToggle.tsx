/**
 * S6 설정의 카메라 권한 **표시 전용** 토글 (Figma `Control / Toggle` 43:89 — 51×31,
 * On=brand/primary, Off=#E9E9EA, 노브 27 white + 그림자).
 *
 * **네이티브 `<input type="checkbox">` 토글을 쓰지 않는다**(`SCR-S6-settings.md` Components):
 *   ① 이 토글은 조작 컨트롤이 아니라 OS 권한 상태의 표시다 — 값이 바뀌지 않으므로
 *      토글 컨트롤의 의미(값 변경)와 어긋나고, 낙관적으로 값을 뒤집으면 실제 권한과 어긋난 화면이 된다.
 *   ② 앱 UI는 플랫폼 공통을 지향한다(`design.md` 파운데이션) — 원본 RN 컴포넌트를 그대로 옮긴다.
 *
 * 실제 권한 변경은 OS 설정 앱에서만 일어난다 — 탭은 부모 행이 받아 시스템 설정을 연다.
 */

const TRACK_WIDTH = 51;
const KNOB_SIZE = 27;
const KNOB_INSET = 2;

type PermissionToggleProps = {
  /** OS 권한 허용 여부. 이 컴포넌트는 값을 바꾸지 않는다. */
  granted: boolean;
};

export function PermissionToggle({ granted }: PermissionToggleProps) {
  return (
    <div
      // 상태는 행의 aria-label이 텍스트로 읽어준다(색상 단독 전달 금지) —
      // 그래픽까지 접근성 트리에 남으면 같은 정보가 두 번 읽힌다.
      aria-hidden="true"
      className="h-[31px] w-[51px] shrink-0 rounded-full"
      // Off 트랙 색은 Figma 원본이 변수에 바인딩하지 않아 실측 #e9e9ea 였는데, 다크 모드 값이
      // 없어 웹뷰 다크에서 밝은 회색 그대로 남았다. 가장 가까운 시맨틱 토큰 bg-layer-2 로 갈음해
      // 라이트·다크를 모두 따르게 한다.
      style={{
        backgroundColor: granted ? "var(--color-primary)" : "var(--color-bg-layer-2)",
        display: "flex",
        alignItems: "center",
      }}
    >
      <div
        className="size-[27px] rounded-full bg-white"
        style={{
          marginLeft: granted ? TRACK_WIDTH - KNOB_INSET - KNOB_SIZE : KNOB_INSET,
          // 노브 그림자는 의미색이 아니라 깊이 표현이라 대응 토큰이 없다(S1 CTA 카드와 동일 처리).
          boxShadow: "0 2px 3px 0 rgba(0, 0, 0, 0.15)",
        }}
      />
    </div>
  );
}
