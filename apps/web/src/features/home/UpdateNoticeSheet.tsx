import { useEffect, useRef, useState } from "react";

/**
 * U1 업데이트 안내 시트 (`apps/mobile/components/UpdateNoticeSheet.tsx`에서 이식 — BY-329.
 * 스펙: SCR-U1-update-sheet.md, Figma `Sheet / Bottom` 44:96 → 사용처 67:840).
 *
 * **순수 프레젠테이션 컴포넌트다** — 노출 플래그를 직접 읽지 않는다(`visible`만 받는다).
 * 게이트는 `updateNotice.ts`, 상태 보유는 `UpdateNoticeSheetHost`가 맡는다.
 *
 * V1.2 로그인 예고 안내다 — 스토어 이동 버튼·강제/선택 업데이트 분기를 넣지 않는다
 * (Figma에 변형이 없고 wiki에 정의가 없다). 닫는 방법은 `확인` CTA 하나다.
 *
 * RN판의 `Animated` 모션(슬라이드 320ms cubic-bezier(0.32,0.72,0,1) · 딤 fade 250ms —
 * Spec `6. Motion & Handoff` 실측값)을 CSS transition으로 옮겼다. 닫힘은 스펙 지시대로
 * "여는 모션의 역재생"(시간축 반전 베지어).
 */

/** 딤 = black 60% 고정 — 시맨틱 `--dim`(40%)과 어긋나는 Figma 실측값을 따르는 RN판 결정 그대로. */
export const UPDATE_NOTICE_DIM_COLOR = "rgba(0,0,0,0.6)";

const SHEET_TRANSITION_OPEN = "transform 320ms cubic-bezier(0.32, 0.72, 0, 1)";
const SHEET_TRANSITION_CLOSE = "transform 320ms cubic-bezier(1, 0, 0.68, 0.28)";
const DIM_TRANSITION = "opacity 250ms ease";

/** 아직 확정되지 않은 닫기 경로들(스펙 Interaction Contract의 "미정" 행). */
export type UpdateNoticeDismissSource = "dim-press";

export function UpdateNoticeSheet({
  visible,
  onConfirm,
  onDismissRequest,
}: {
  visible: boolean;
  /** `확인` CTA — 지금 유일하게 연결된 닫기 경로다. */
  onConfirm: () => void;
  /**
   * 딤 탭 닫기는 **미정이다** — 동작을 켜지 않고 콜백 자리만 열어 둔다(RN판과 동일).
   * 넘기지 않으면(기본) 딤 탭은 아무 일도 일어나지 않는다.
   */
  onDismissRequest?: (source: UpdateNoticeDismissSource) => void;
}) {
  // 닫힘 모션을 끝까지 보여주려면 `visible`이 false가 된 뒤에도 잠깐 더 마운트돼 있어야 한다.
  const [rendered, setRendered] = useState(visible);
  // false = 화면 밖(translateY 100%) · true = 제자리. rendered 직후 한 프레임 늦게 켜야 전환이 발화한다.
  const [open, setOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visible) {
      setRendered(true);
      // 마운트 프레임에 바로 open이면 transition이 생략된다 — 다음 프레임에 연다.
      const frame = requestAnimationFrame(() => setOpen(true));
      return () => cancelAnimationFrame(frame);
    }
    setOpen(false);
    return undefined;
  }, [visible]);

  if (!rendered) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-notice-title"
      data-testid="update-notice-sheet"
      className="fixed inset-0 z-50 flex flex-col justify-end"
    >
      {/* 딤은 장식이다 — 탭은 받되 기본 동작은 없다(미정). */}
      <div
        data-testid="update-notice-dim"
        aria-hidden="true"
        onClick={() => onDismissRequest?.("dim-press")}
        className="absolute inset-0"
        style={{
          backgroundColor: UPDATE_NOTICE_DIM_COLOR,
          opacity: open ? 1 : 0,
          transition: DIM_TRANSITION,
        }}
      />
      <div
        ref={sheetRef}
        onTransitionEnd={(event) => {
          // 닫힘 슬라이드가 끝나면 언마운트한다. 딤 fade의 이벤트는 위 div에서 나므로 안 겹친다.
          if (event.target === sheetRef.current && !open) {
            setRendered(false);
          }
        }}
        className="relative flex w-full flex-col items-center gap-2 rounded-t-[24px] bg-background px-5 pt-3 pb-[max(44px,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgba(0,0,0,0.18)]"
        style={{
          transform: open ? "translateY(0)" : "translateY(100%)",
          transition: open ? SHEET_TRANSITION_OPEN : SHEET_TRANSITION_CLOSE,
        }}
      >
        {/* 핸들(36×4)은 순수 장식 — 제스처 미연결이므로 "끌어서 닫기"로 안내하지 않는다. */}
        <div aria-hidden="true" className="h-1 w-9 rounded-full bg-border-strong" />

        <div className="flex w-full flex-col items-start gap-2 pt-2.5">
          {/* Figma 실측 19/23 Bold — heading.h3(18/26)와 달라 실측값을 쓴다. */}
          <h2
            id="update-notice-title"
            className="text-[19px] leading-[23px] font-bold text-foreground"
          >
            로그인이 곧 추가돼요
          </h2>
          {/* 로그인 제공자는 Google·Apple만 언급한다(policies.md §2). 클립하지 않는다(스펙 Content). */}
          <div className="w-full">
            <p className="text-[14px] leading-[21px] text-muted-foreground">
              다음 업데이트부터 Google·Apple 계정으로 로그인할 수 있어요.
            </p>
            <p className="text-[14px] leading-[21px] text-muted-foreground">
              지금까지의 기록도 로그인하면 계정에 그대로 이어져요.
            </p>
          </div>
        </div>

        {/* Figma `spacer` 44:95 — 텍스트 블록과 CTA 사이 간격. */}
        <div className="size-2.5" />

        {/* Figma `Button / CTA` LG — 세션 화면 CTA(AutoEndNotice)와 같은 형태. */}
        <button
          type="button"
          onClick={onConfirm}
          data-testid="update-notice-confirm"
          className="h-[52px] w-full shrink-0 rounded-2xl bg-primary text-[17px] font-bold text-primary-foreground transition-opacity duration-200 active:opacity-90 motion-reduce:transition-none"
        >
          확인
        </button>
      </div>
    </div>
  );
}
