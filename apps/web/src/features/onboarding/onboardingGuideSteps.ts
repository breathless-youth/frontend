/**
 * G1~G5 온보딩 가이드의 스텝 선언 (`frontend/docs/screens/SCR-G1-G5-onboarding-guide.md`).
 *
 * G1~G5는 5개의 독립 화면이 아니라 **하나의 플로우가 갖는 5개 스텝**이다 — 라우트도 하나,
 * 이 배열도 하나다. 배경·하단 내비게이션·페이저 도트는 공통이고 스텝마다 바뀌는 것은
 * 툴팁 내용·툴팁 위치·강조 대상·목업 배경의 상태뿐이라, 그 차이만 여기 데이터로 적는다.
 *
 * **문구를 화면 코드에 흩뿌리지 않는다.** 카피의 원본은 `ai-wiki/product/voice-tone.md` §4였고,
 * 2026-07-29 팀(리더) 확정으로 아래 항목이 개정됐다 — G1·G2 본문 표현, G3 제목·본문, G4 본문
 * 축약, G5 본문 축약, 프라이버시 캡션 전 스텝 삭제 (BY-151 코멘트 참고). **voice-tone 위키와
 * Figma 텍스트 노드는 이 개정을 아직 반영하지 않았다** — 위키·Figma 동기화는 후속 작업이다.
 * 의역·문장부호 변경·임의 줄바꿈 삽입 금지는 그대로 유지한다.
 *
 * (`apps/mobile/lib/onboardingGuideSteps.ts`에서 이식 — BY-334 온보딩 웹 이관.
 * 순수 데이터·순수 함수뿐이라 **내용 변경 없이** 그대로 옮겼다.)
 */

/** 가이드 진입 출처. 종료 후 동작이 갈릴 수 있어 플로우가 끝까지 들고 다닌다. */
export type OnboardingGuideEntry =
  /** A. S1 홈 "집중 시작" 최초 탭 — 종료 후 카메라 권한 요청(S2-2)으로 이어진다. */
  | "focus-start"
  /** B. S1 홈 "공부 측정 가이드" 카드 — 다시 보기. */
  | "home-card"
  /** C. S6 설정 "측정 기준 안내" — 다시 보기. MG4가 이 값으로 진입시킨다. */
  | "settings";

const ENTRIES: readonly OnboardingGuideEntry[] = ["focus-start", "home-card", "settings"];

/** 라우트 파라미터(문자열)를 진입 출처로 좁힌다. 알 수 없는 값은 재진입으로 취급한다. */
export function parseOnboardingGuideEntry(raw: string | undefined): OnboardingGuideEntry {
  const found = ENTRIES.find((entry) => entry === raw);
  if (found) {
    return found;
  }
  // 출처를 모르는 진입에서 세션을 시작해버리면 사용자가 요청하지 않은 카메라 권한 요청이
  // 뜬다 — 모르면 "다시 보기"로 떨어뜨리는 쪽이 안전하다.
  return "home-card";
}

/** 가이드 플로우가 끝난 이유. 둘 다 `markGuideSeen()`을 부르고 같은 다음 단계로 간다. */
export type OnboardingGuideExitReason = "completed" | "skipped";

export const GUIDE_PREV_LABEL = "이전";
export const GUIDE_NEXT_LABEL = "다음";
export const GUIDE_START_LABEL = "집중 시작하기";
/** 재진입(홈 카드·설정) 마지막 CTA — 세션을 시작하지 않으므로 문구도 종료를 말한다(2026-07-29 확정). */
export const GUIDE_CLOSE_LABEL = "가이드 종료하기";
export const GUIDE_SKIP_LABEL = "건너뛰기";

/**
 * G1~G4 하단 힌트. Figma에서는 한 줄 텍스트지만 "건너뛰기"만 탭 가능해야 하고
 * 그 탭 영역이 44×44 이상이어야 해서(접근성 요건) 앞부분과 나눠 렌더한다 —
 * 합쳐진 문자열이 원문과 어긋나지 않도록 여기서 조립한다.
 */
export const GUIDE_HINT_PREFIX = "좌우로 밀거나 화면을 탭해도 넘어가요 · ";
export const GUIDE_BOTTOM_HINT = `${GUIDE_HINT_PREFIX}${GUIDE_SKIP_LABEL}`;

/** G5 하단 힌트 — 재진입 경로(설정 › 측정 기준 안내)를 사용자에게 약속하는 문장이다. */
export const GUIDE_FINAL_HINT = "이 안내는 설정 > 측정 기준 안내에서 언제든 다시 볼 수 있어요";

/** 목업 배경 문구 — 전부 기존 확정 문구 재사용(새로 짓지 않는다). */
export const MOCK_FOCUS_PILL_LABEL = "집중 측정 중";
export const MOCK_DISTRACT_PILL_LABEL = "자리를 비운 것 같아요";
export const MOCK_DISTRACT_PILL_SUBLABEL = "돌아오면 자동으로 다시 측정돼요";
/** G4 일시정지 필 — 실제 세션 일시정지 필(`sessionCopy.ts`)의 확정 문구 재사용(BY-427). */
export const MOCK_PAUSED_PILL_LABEL = "측정을 일시정지했어요";
// "영상은 기기 안에서만 처리돼요" 타이머 캡션은 2026-07-29 확정으로 전 스텝에서 삭제됐다 —
// 프라이버시 안내는 G5 카드가 전담한다.

export type CoachTooltipContent = {
  title: string;
  body: string;
  /** 꼬리가 카드의 어느 쪽에 붙는가 — G3만 위쪽(툴팁이 강조 대상 아래에 있다). */
  tail: "top" | "bottom";
};

export type MockStatusPill = {
  state: "focus" | "distract" | "paused";
  label: string;
  /** 상태 필 아래 한 줄 보조 문구(G2만 있다). */
  subLabel?: string;
};

/**
 * 순공 타이머의 색조. Figma가 **텍스트 노드마다 fill을 직접 지정**해둔 값이며, 총 공부 줄은
 * 5스텝 모두 white 42%로 같다 — 즉 순공 타이머의 색만 스텝마다 달라지는 것이 규칙이다.
 *
 * | 스텝 | Figma node | fill |
 * | --- | --- | --- |
 * | G1 | `68:906`  | `#ffffff` |
 * | G2 | `68:982`  | `#8b95a1` |
 * | G3 | `68:1061` | `#4593fc` (발광) |
 * | G4 | `68:1124` | `#8b95a1` |
 * | G5 | `68:1291` | `#ffffff` |
 *
 * (G5는 2026-08-25 BY-427 확정으로 목업 타이머 자체를 렌더하지 않는다 — 표의 G5 행은
 * Figma 실측 기록용으로만 남긴다.)
 *
 * 색조 이름(`active`/`stopped`/`simple`)은 **Figma 실측값을 묶기 위한 라벨**이지 확정된
 * 의미 규정이 아니다. `stopped`를 "일시정지색"으로 읽으면 안 된다 — Figma는 실제 세션
 * 프레임에서도 **비집중과 일시정지의 타이머 색을 구분하지 않는다**(S3-2 비집중 `59:315`,
 * S3-3 일시정지 `59:359` 둘 다 `#8b95a1`, S3-1 집중 `58:358`만 흰색). 상태 구분은 상태 필이
 * 전담하고, 타이머가 상태색을 갖는 것은 심플 모드뿐이다.
 *
 * 그 패턴이 `design.md` 6차 "세션 오버레이 색"(_타이머_ 비집중색 `#FF9E1B`)과 어긋나지만,
 * 온보딩 목업만의 문제가 아니라 실제 세션 프레임에 이미 존재하는 충돌이다. 여기서는
 * **Figma 실측값을 그대로 옮기기만 한다** — 어느 쪽이 확정인지는 디자인 시스템 레벨에서 열려 있다.
 * TODO(SCR-G1-G5-onboarding-guide.md Review Checklist): 비집중 타이머 색 괴리(#FF9E1B vs #8b95a1) — 디자인 시스템 레벨, 영향 범위 S3-2·S3-3
 */
export type FocusTimerTone =
  /** 흰색 (G1·G5) */
  | "active"
  /** 회색 `#8b95a1` (G2·G4) — 위 주석의 미확정 사항 참고 */
  | "stopped"
  /** 발광 블루 (G3) */
  | "simple";

/**
 * 목업 배경의 스텝별 상태. **표시 전용이다** — 실제 세션 로직·카메라·집계와 무관하고
 * 서버에 아무것도 보내지 않는다(스펙 Ownership Boundary).
 */
export type MockBackdrop = {
  /** `camera`=카메라 프리뷰 목업(#1A2029 + 사선 밴드) / `simple`=심플 모드(#0B0F14 + 글로우). */
  base: "camera" | "simple";
  /** dim 불투명도 — Figma 실측(G3만 0.45, 나머지 0.55). */
  dimOpacity: number;
  statusPill: MockStatusPill | null;
  /** 컨트롤 바가 dim 위로 올라와 강조되는가(G4) — Figma는 y756→y409로 끌어올려 표현했다. */
  controlBar: "behind-dim" | "raised";
  /**
   * 목업 타이머 블록(순공 HH:MM:SS + 총 공부)을 렌더하는가. G5만 끈다(2026-08-25 BY-427
   * 확정) — 프라이버시 카드가 이 스텝의 유일한 메시지라 시연 타이머를 표시하지 않는다.
   */
  showTimer: boolean;
  /** 순공 타이머 시드(초). Figma 시안값 — 실시간 카운터의 출발점으로만 쓴다. */
  seedFocusSec: number;
  /** 총 공부 타이머 시드(초). */
  seedTotalSec: number;
  /**
   * 순공 타이머를 멈추는가(G2·G4). G2는 이것만 켜서 "순공은 멈추고 총 공부는 계속 흐르는"
   * 비집중의 인과를 보여준다 — 이 인과가 G2의 교육 목적 그 자체다. 애니메이션을 단순화하더라도
   * 깨지 않는다.
   */
  freezeFocusTimer: boolean;
  /**
   * 총 공부 타이머까지 멈추는가(G4). 일시정지 카피가 "순공시간과 총 공부 시간이 모두 멈춰요"
   * 이므로 시연도 둘 다 멈춘다(2026-08-25 BY-427 확정). G2(비집중)는 총 공부가 계속 흐르는
   * 것이 교육 목적이라 이 플래그를 켜지 않는다.
   */
  freezeTotalTimer: boolean;
  /** 순공 타이머 색조 — Figma 텍스트 노드의 fill 그대로(위 `FocusTimerTone` 표 참고). */
  focusTimerTone: FocusTimerTone;
};

/** 툴팁이 무엇 바로 옆에 붙는가 = Figma의 y좌표가 표현하려던 "관계". */
export type CoachAnchor =
  /** 툴팁이 타이머 블록 바로 위 (G1·G2) */
  | "above-timer"
  /** 툴팁이 타이머 블록 바로 아래 (G3) */
  | "below-timer"
  /** 툴팁이 끌어올린 컨트롤 바 바로 위 (G4) */
  | "above-control-bar"
  /** 툴팁 대신 프라이버시 카드가 상단에 (G5) */
  | "privacy-card";

/**
 * 세로 배치 비율. 여백의 **비율**이지 좌표가 아니다 — 화면 높이가 달라도 "강조 대상 바로
 * 위/아래"라는 관계가 유지되도록 flexGrow로 옮긴다.
 *
 * ⚠️ 값은 더 이상 Figma 실측 그대로가 아니다(BY-343). 기준은 **목업 타이머가 실제 세션
 * 화면과 같은 자리에 있는 것**이다 — 카메라 모드(G1·G2·G4·G5)는 하단 컨트롤 바 위(세션
 * 프리뷰의 `grow` 스페이서와 동일한 1:0), 심플 모드(G3)는 상태 필~하단 사이 균등(1:1,
 * `RoomPage`의 심플 모드 배분과 동일). 말풍선·카드는 그 타이머에 인접해서만 움직인다 —
 * 가이드를 넘겨도 타이머가 널뛰지 않고, 가이드가 보여주는 화면이 실제 세션과 같아진다.
 */
export type CoachSpacing = {
  /** 상단 여백 비중(상태 필 아래 ~ 첫 블록). */
  topFlex: number;
  /** 중간 여백 비중(첫 블록 ~ 타이머 블록). `privacy-card`·`below-timer`에서만 의미가 있다. */
  midFlex: number;
  /** 하단 여백 비중(마지막 블록 ~ 하단 내비게이션). */
  bottomFlex: number;
};

export type OnboardingGuideStep = {
  id: "G1" | "G2" | "G3" | "G4" | "G5";
  /** Figma 프레임 node id — QA 대조용. */
  figmaNodeId: string;
  tooltip: CoachTooltipContent | null;
  /** G5 전용 일러스트 카드(툴팁 대신). */
  privacyCard: { title: string; body: string } | null;
  anchor: CoachAnchor;
  spacing: CoachSpacing;
  /** 오른쪽 큰 버튼의 라벨. */
  ctaLabel: string;
  /** 하단 힌트 안에 "건너뛰기"가 있는가 — Figma상 G5에는 없다. */
  skippable: boolean;
  backdrop: MockBackdrop;
  /**
   * dim 위로 올라와 스크린 리더에도 노출되는 "이 스텝의 강조 대상".
   * 툴팁이 무엇을 가리키는지 시각에 의존하지 않고 알 수 있어야 한다(스펙 접근성 요건).
   * `none`은 툴팁이 배경의 무언가를 가리키지 않는 스텝(G5 — 카드가 스스로 내용을 갖는다).
   */
  emphasis: "timer" | "status-pill" | "control-bar" | "none";
};

export const ONBOARDING_GUIDE_STEPS: readonly OnboardingGuideStep[] = [
  {
    id: "G1",
    figmaNodeId: "68:902",
    tooltip: {
      title: "순공시간이 여기에 쌓여요",
      body: "집중하는 동안 타이머가 흘러가요.",
      tail: "bottom",
    },
    privacyCard: null,
    anchor: "above-timer",
    spacing: { topFlex: 1, midFlex: 0, bottomFlex: 0 },
    ctaLabel: GUIDE_NEXT_LABEL,
    skippable: true,
    emphasis: "timer",
    backdrop: {
      base: "camera",
      dimOpacity: 0.55,
      statusPill: { state: "focus", label: MOCK_FOCUS_PILL_LABEL },
      controlBar: "behind-dim",
      showTimer: true,
      seedFocusSec: 19,
      seedTotalSec: 22,
      freezeFocusTimer: false,
      freezeTotalTimer: false,
      focusTimerTone: "active",
    },
  },
  {
    id: "G2",
    figmaNodeId: "68:976",
    tooltip: {
      title: "집중이 아니면, 잠시 멈춰요",
      body: "자리를 비우거나 다른 일을 하면 타이머가 멈추고, 위 상태 표시가 주황으로 바뀌어요. 다시 집중하면 저절로 흘러가요.",
      tail: "bottom",
    },
    privacyCard: null,
    anchor: "above-timer",
    spacing: { topFlex: 1, midFlex: 0, bottomFlex: 0 },
    ctaLabel: GUIDE_NEXT_LABEL,
    skippable: true,
    emphasis: "status-pill",
    backdrop: {
      base: "camera",
      dimOpacity: 0.55,
      statusPill: {
        state: "distract",
        label: MOCK_DISTRACT_PILL_LABEL,
        subLabel: MOCK_DISTRACT_PILL_SUBLABEL,
      },
      controlBar: "behind-dim",
      showTimer: true,
      // 순공 12 < 총 22 — Figma 시안이 "비집중 = 순공 정지 / 총 진행"을 이 차이로 보여준다.
      seedFocusSec: 12,
      seedTotalSec: 22,
      freezeFocusTimer: true,
      freezeTotalTimer: false,
      // Figma는 순공 타이머 fill을 흰색이 아닌 `#8b95a1`로 지정했다(`68:982`). 값이 멈춘 것만
      // 으로는 1초 이상 봐야 알아채므로 색 대비가 "순공만 멈췄다"를 즉시 읽히게 해 준다.
      // ⚠️ 이 회색은 `design.md`의 타이머 비집중색(`#FF9E1B`)과 어긋나지만 실제 세션 프레임
      // (S3-2 `59:315`)도 같은 회색이라 **디자인 시스템 레벨의 미확정 사항**이다 —
      // G4의 색↔값 모순(2026-08-25 BY-427로 해소 — 값을 색에 맞춰 멈췄다)과는 **별개 사안**이니
      // 함께 묶어 해소하지 말 것(`FocusTimerTone` 주석 참고).
      focusTimerTone: "stopped",
    },
  },
  {
    id: "G3",
    figmaNodeId: "68:1057",
    tooltip: {
      title: "탭 한 번이면, 타이머만 떠요",
      body: "공부 중 화면을 탭하면 타이머만 남는 심플 모드가 돼요. 한 번 더 탭하면 원래 화면으로 돌아와요.",
      tail: "top",
    },
    privacyCard: null,
    anchor: "below-timer",
    spacing: { topFlex: 1, midFlex: 0, bottomFlex: 1 },
    ctaLabel: GUIDE_NEXT_LABEL,
    skippable: true,
    emphasis: "timer",
    backdrop: {
      base: "simple",
      // G3만 dim이 0.45다(Figma 실측) — 심플 모드 배경 자체가 이미 더 어둡다.
      dimOpacity: 0.45,
      // ⚠️ Figma G3 프레임(`68:1057`)에는 상태 필 인스턴스가 아예 없다. `ai-wiki/product/design.md`의
      // 심플 모드 정의는 "상태 필·컨트롤 바 유지"라 서로 어긋난다 — 어느 쪽이 확정인지 미확인이라
      // 임의로 고르지 않고 Figma 그대로(없음) 둔다.
      // TODO(SCR-G1-G5-onboarding-guide.md Current Limitations): G3 상태 필 유무 확정 필요.
      statusPill: null,
      controlBar: "behind-dim",
      showTimer: true,
      seedFocusSec: 1508,
      seedTotalSec: 1668,
      freezeFocusTimer: false,
      freezeTotalTimer: false,
      focusTimerTone: "simple",
    },
  },
  {
    id: "G4",
    figmaNodeId: "68:1118",
    tooltip: {
      title: "잠깐 쉴 땐 일시정지",
      body: "일시정지하면 순공시간과 총 공부 시간이 모두 멈춰요.",
      tail: "bottom",
    },
    privacyCard: null,
    anchor: "above-control-bar",
    // G4만 하단에서 살짝 띄운다(4:1) — 끌어올린 컨트롤 바가 목업의 강조 장치라 세션 실배치
    // (맨 아래)와 같을 필요가 없고, 하단 내비게이션과 붙어 있으면 답답하다는 피드백(BY-343).
    spacing: { topFlex: 4, midFlex: 0, bottomFlex: 1 },
    ctaLabel: GUIDE_NEXT_LABEL,
    skippable: true,
    emphasis: "control-bar",
    backdrop: {
      base: "camera",
      dimOpacity: 0.55,
      // 일시정지 스텝이므로 필도 일시정지 상태를 보여준다(2026-08-25 BY-427 사용자 피드백 —
      // "집중 측정 중"이 떠 있으면 카피("모두 멈춰요")·회색 타이머와 어긋난다).
      statusPill: { state: "paused", label: MOCK_PAUSED_PILL_LABEL },
      controlBar: "raised",
      showTimer: true,
      seedFocusSec: 20,
      seedTotalSec: 23,
      // 해소됨(2026-08-25 BY-427): G4의 색↔값 모순 — Figma(`68:1124`)는 값을 진행 중
      // (`00:00:20`)으로 두면서 색만 회색으로 칠해, 그대로 옮기면 **회색인데 초가 올라가는**
      // 숫자가 됐다. 사용자 확정으로 **값을 색에 맞춰 멈추는 쪽**을 택했다 — 카피("순공시간과
      // 총 공부 시간이 모두 멈춰요")대로 순공·총 공부 둘 다 얼린다.
      // G4는 일시정지 스텝이라 회색 자체는 `design.md`와 일치한다 — G2의 색 괴리(디자인 시스템
      // 레벨 미확정)와는 여전히 **별개 사안**이니 묶지 말 것.
      freezeFocusTimer: true,
      freezeTotalTimer: true,
      focusTimerTone: "stopped",
    },
  },
  {
    id: "G5",
    figmaNodeId: "68:1285",
    tooltip: null,
    privacyCard: {
      title: "영상은 기기 밖으로 나가지 않아요",
      body: "측정은 기기 안에서만 이루어지고, 영상은 저장하지 않아요. 공부 시간만 기록돼요.",
    },
    anchor: "privacy-card",
    spacing: { topFlex: 1, midFlex: 1, bottomFlex: 0 },
    ctaLabel: GUIDE_START_LABEL,
    // Figma G5 하단 힌트에는 "건너뛰기"가 없다 — CTA가 곧 종료라 별도 탈출구가 필요 없다.
    skippable: false,
    // 툴팁이 없어 배경의 무언가를 가리키지 않는다 — 배경 전체가 장식이다.
    emphasis: "none",
    backdrop: {
      base: "camera",
      dimOpacity: 0.55,
      statusPill: { state: "focus", label: MOCK_FOCUS_PILL_LABEL },
      controlBar: "behind-dim",
      // G5는 목업 타이머를 렌더하지 않는다(2026-08-25 BY-427 확정) — 프라이버시 카드가 이
      // 스텝의 유일한 메시지다. Figma(`68:1291`)에는 타이머가 있지만 사용자 확정이 우선한다.
      // 상태 필·컨트롤 바 등 다른 목업 요소는 그대로 둔다. 아래 시드·색조는 타입상 남는 값일
      // 뿐 표시되지 않는다.
      showTimer: false,
      seedFocusSec: 20,
      seedTotalSec: 23,
      freezeFocusTimer: false,
      freezeTotalTimer: false,
      focusTimerTone: "active",
    },
  },
];

export const ONBOARDING_GUIDE_STEP_COUNT = ONBOARDING_GUIDE_STEPS.length;

/** 페이저 도트가 색·크기로만 전달하는 진행 상태를 스크린 리더에도 텍스트로 준다. */
export function guideProgressLabel(stepIndex: number): string {
  return `${ONBOARDING_GUIDE_STEP_COUNT}단계 중 ${stepIndex + 1}단계`;
}

/**
 * 목업 타이머 표기 — `HH:MM:SS` 고정(`voice-tone.md` §2 표기 규칙).
 * 이 화면의 시연용 카운터 전용이다. 실제 세션 타이머는 `apps/web`(WG 계열)이 별도로 갖는다 —
 * 두 앱은 컴포넌트도 포맷터도 공유하지 않는다(ADR 0001).
 */
export function formatSessionClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

/** 총 공부 병기 표기 — `총 HH:MM:SS`(`voice-tone.md` §2). */
export function formatTotalStudyClock(totalSeconds: number): string {
  return `총 ${formatSessionClock(totalSeconds)}`;
}
