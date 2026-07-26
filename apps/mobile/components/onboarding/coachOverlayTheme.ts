import { colors, radius } from "@focuson/design-tokens";

/**
 * 온보딩 가이드(G1~G5)가 쓰는 색·치수 한 곳
 * (`frontend/docs/screens/SCR-G1-G5-onboarding-guide.md` Design Tokens Used).
 *
 * ## 왜 NativeWind `dark:` 유틸을 쓰지 않는가
 *
 * `tailwind.config.js`의 `darkMode: "media"`는 **시스템 테마**를 따라간다. 그런데 이 플로우는
 * 시스템 테마와 무관하게 **항상 다크 오버레이 위**에 그려진다(Figma 5프레임 모두 다크 고정,
 * 스펙 "이 화면은 라이트/다크 테마 분기가 없다"). `dark:` 유틸을 쓰면 라이트 모드 기기에서
 * 라이트값이 나와 다크 배경 위 대비가 무너진다 — 그래서 토큰의 **다크값을 직접** 집어 쓴다.
 *
 * ## 왜 일부 값은 시맨틱 토큰이 아닌가
 *
 * `ai-wiki/product/design.md`의 "세션 오버레이 색" 행이 "시맨틱 토큰과 별도로 세션 화면에서만
 * 사용"으로 확정한 다크 오버레이 전용 값들이다. 억지로 시맨틱 토큰에 매핑하지 않고 Figma
 * 실측값을 그대로 쓰되, 화면 코드에 흩뿌리지 않도록 전부 이 파일에 모은다.
 * 값이 기존 토큰과 **정확히 일치하는 것만** 토큰에 바인딩했다(아래 주석 참고).
 */

/**
 * ⚠️ 확인 필요 — `state/focus`의 라이트/다크 중 어느 값인가.
 *
 * Figma는 CTA 배경을 `state/focus` 변수에 바인딩해뒀는데 읽히는 값이 `#1b64da`(라이트값)다.
 * 반면 같은 파일의 다른 근거는 전부 다크값(`#4593fc`)을 가리킨다:
 *   - Figma `Button / CTA` 컴포넌트 설명: "Dark SM … primary는 **다크 위 시인성용** blue/500=state/focus"
 *   - `illust/privacy-camera`(G5 일러스트) 실측 스트로크 = `#4593FC`
 *   - G3 심플 모드 타이머 발광색 = `#4593FC`
 *   - `design.md` 세션 오버레이 전용 규칙: 집중 `#4593FC`
 * 스펙도 이 괴리를 `design-tokens-sync` 확인 항목으로 남겼다. 확정 전까지는 **다크값**으로 둔다
 * (항상 다크 배경 위이므로 시인성 기준이 우선).
 * TODO(SCR-G1-G5-onboarding-guide.md Review Checklist): 확정되면 이 상수 하나만 바꾼다.
 */
export const GUIDE_FOCUS_COLOR = colors.state.focus.dark;

/**
 * 비집중 상태색. Figma G2는 도트에 `#FF8A00`(라이트값), 보더에 `#FF9E1B` 35%(다크값)를 써서
 * 자기 자신과 어긋나 있다 — 위와 같은 이유로 다크값으로 통일한다.
 */
export const GUIDE_DISTRACT_COLOR = colors.state.distract.dark;

/**
 * Distract 상태 필의 보더 — Figma 실측 `rgba(255,158,27,0.35)`.
 * 8자리 hex의 마지막 `59`(=89/255)가 35% 알파다.
 */
export const GUIDE_DISTRACT_BORDER = `${GUIDE_DISTRACT_COLOR}59`;

/** 다크 오버레이 전용 값(토큰 아님) — Figma 실측. */
export const coachOverlay = {
  /** 툴팁·프라이버시 카드 서피스. */
  cardBg: "rgba(25,31,40,0.97)",
  cardBorder: "rgba(255,255,255,0.10)",
  /** 카드 그림자 `0 16px 40px rgba(0,0,0,0.45)`. */
  cardShadow: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.45,
    shadowRadius: 40,
    elevation: 12,
  },
  /** 툴팁 본문 색. Figma 확정값이므로 임의로 더 낮추지 않는다(명암비). */
  cardBodyText: "rgba(255,255,255,0.65)",
  /** "이전" 고스트 버튼. */
  ghostBg: "rgba(22,27,34,0.60)",
  ghostBorder: "rgba(255,255,255,0.18)",
  ghostLabel: "rgba(255,255,255,0.85)",
  /** 페이저 비활성 도트. */
  pagerInactive: "rgba(255,255,255,0.30)",
  /** 하단 힌트 텍스트. */
  bottomHint: "rgba(255,255,255,0.60)",
  /** 목업 배경 — 카메라 프리뷰 목업(실제 카메라가 아니다). */
  mockCameraBg: "#1A2029",
  mockStripe: "rgba(255,255,255,0.03)",
  mockPreviewLabel: "rgba(255,255,255,0.16)",
  /** 목업 배경 — 심플 모드. */
  mockSimpleBg: "#0B0F14",
  /** 목업 타이머 블록 — 진행 중(`active`) 색. 정지·심플 색은 `coachTokenColors` 참고. */
  mockTimer: "#FFFFFF",
  mockTotal: "rgba(255,255,255,0.42)",
  mockCaption: "rgba(255,255,255,0.55)",
  /** 상태 필(글래스 캡슐). */
  pillBgFocus: "rgba(16,20,25,0.65)",
  pillBgDistract: "rgba(16,20,25,0.68)",
  pillBorderFocus: "rgba(255,255,255,0.12)",
  /** 컨트롤 바(글래스 캡슐). */
  controlBarBg: "rgba(22,27,34,0.55)",
  controlBarBorder: "rgba(255,255,255,0.10)",
  controlBarHandle: "rgba(255,255,255,0.22)",
  controlButtonBg: "rgba(255,255,255,0.12)",
} as const;

/**
 * 값이 기존 시맨틱 토큰과 **정확히 일치**하는 것들 — 하드코딩 대신 토큰에 바인딩한다.
 * (`icons.tsx`가 같은 판단을 한 선례가 있다.)
 */
export const coachTokenColors = {
  /** 툴팁·카드 타이틀 `#F9FAFB` = `text/primary` 다크값. */
  cardTitle: colors.text.primary.dark,
  /** 컨트롤 바 종료 버튼 `#FF6B77` = `feedback/error` 다크값. */
  exitButton: colors.feedback.error.dark,
  /**
   * G5 일러스트·G3 심플 모드 타이머의 발광 블루 `#4593FC` = `state/focus` 다크값.
   * Figma가 **변수 바인딩 없이 하드코딩**해둔 값이라 위 `GUIDE_FOCUS_COLOR`의 미확정 이슈와
   * 무관하다 — CTA 색이 라이트값으로 확정되더라도 이 값은 그대로다. 그래서 상수를 분리했다.
   */
  privacyIllustAccent: colors.state.focus.dark,
  /**
   * G2·G4 순공 타이머의 회색 `#8b95a1` — **Figma 실측값을 옮긴 것이다**(`68:982`·`68:1124`).
   * 값이 `text/tertiary`와 정확히 같아 하드코딩 대신 토큰에 바인딩했다. Light/Dark 값이
   * 동일해 다크 오버레이 위에서도 그대로 쓴다.
   *
   * ⚠️ **이 값을 "일시정지색"으로 읽지 말 것.** 값이 `sessionStateColors.PAUSE`와 같은 것은
   * 사실이지만, Figma는 이 회색을 일시정지에만 쓰지 않는다 — 실제 세션 프레임에서 확인했다:
   * S3-1 집중(`58:358`) `#ffffff` / **S3-2 비집중(`59:315`) `#8b95a1`** /
   * S3-3 일시정지(`59:359`) `#8b95a1`. 즉 **비집중과 일시정지의 타이머 색을 구분하지 않고
   * 상태 필로만 구분**하며, G2의 회색은 온보딩 목업의 일탈이 아니라 파일 전반의 패턴이다.
   *
   * 그 패턴이 `design.md` 6차 "세션 오버레이 색"(_타이머_ 비집중색 `#FF9E1B`)과 어긋나지만,
   * 이는 온보딩과 무관하게 실제 세션 프레임에 이미 존재하는 충돌이라 **디자인 시스템 레벨의
   * 미확정 사항**이다(영향 범위 S3-2·S3-3).
   *
   * 그래서 이 상수를 실제 세션 화면(`apps/web`)의 근거로 가져가지 말 것 — 값이 같아질
   * 가능성이 높다는 것과 별개로, 확정 시 고쳐야 할 지점이 두 앱으로 흩어지면 한쪽만 고치고
   * 닫힐 위험이 있다. 세션 화면은 자체 프레임과 자체 스펙(`SCR-S3-*`)을 근거로 삼는다.
   * TODO(SCR-G1-G5-onboarding-guide.md Review Checklist): 비집중 타이머 색 괴리(#FF9E1B vs #8b95a1) — 디자인 시스템 레벨, 영향 범위 S3-2·S3-3
   */
  mockTimerStopped: colors.text.tertiary.dark,
} as const;

/**
 * 심플 모드(G3) 타이머의 발광. Figma 실측은 `rgba(69,147,252,0.55)`인데 이는 글자색
 * `#4593FC`와 같은 색이다 — 10진수로 다시 적으면 토큰이 바뀔 때 글자만 따라가고 글로우가
 * 어긋나므로 토큰에서 파생시킨다. 8자리 hex의 `8C`(=140/255)가 55% 알파다.
 */
export const GUIDE_SIMPLE_TIMER_GLOW = `${colors.state.focus.dark}8C`;

export const coachRadius = {
  /** 툴팁 `16px` = `radius.lg`. */
  card: radius.lg,
  /** G5 프라이버시 카드 `20px` = `radius.xl`. */
  privacyCard: radius.xl,
  /** 상태 필·컨트롤 바 캡슐·원형 버튼 = `radius.full`. */
  full: radius.full,
  /**
   * 코치마크 버튼 `14px` — 표준 radius 스케일(12·16) 밖의 실측값이다.
   * 가까운 토큰으로 반올림하면 Figma와 눈에 띄게 달라져 실측값을 그대로 쓴다.
   */
  button: 14,
} as const;

/**
 * 모션 값. **미조사 항목이다** — 상태 필 ringOut 확산 페이드, 심플 모드 글로우 잔향,
 * 스텝 전환 duration/easing이 Figma `6. Spec — Motion & Handoff`(node `14:7`)에 있을 수
 * 있으나 스펙 작성 시 조사 범위에 넣지 않았다. 자연스러운 기본값으로 두고 한곳에 모은다.
 * TODO(SCR-G1-G5-onboarding-guide.md Current Limitations): 모션 값 확정 후 교체.
 */
export const coachMotion = {
  /** 강조 대상 링 확산 페이드 1회 길이(ms). */
  ringOutDurationMs: 1600,
  /** 링이 확산되는 최대 배율. */
  ringOutScale: 1.35,
  /** 스텝 전환 페이드(ms). */
  stepFadeMs: 180,
} as const;

/** 스와이프로 인정할 최소 수평 이동(px). 세로 스크롤·탭과 섞이지 않을 만큼만. */
export const SWIPE_THRESHOLD_PX = 48;
