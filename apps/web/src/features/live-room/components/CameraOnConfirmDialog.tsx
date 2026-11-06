import { Lock } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useDialogFocusRestore } from "@/lib/useDialogFocusRestore";

import type { FaceMaskEmoji } from "../faceMaskSettings";

import { FaceMaskEmojiPicker } from "./FaceMaskEmojiPicker";

/**
 * 카메라 켜기 확인 모달
 *
 * 공용 `ui/dialog.tsx`(Radix)를 쓴다. 포커스 트랩·복귀는 Radix 가 맡고, Escape 와 딤 탭만
 * 이 화면의 규칙에 맞게 막는다.
 *
 * 스타일은 Figma V2(node 5315:3824, Soft Blue) 기준. `theme-soft-blue`를 `DialogContent`에
 * 직접 붙여 팔레트를 스코프한다. 세션 화면은 항상 다크라, 호출부가 `container`로 세션 루트
 * (`theme-dark`)를 넘겨야 시스템이 라이트여도 Soft Blue 다크 값으로 그려진다.
 * 구조·카피·접근성 계약은 확정분이다.
 * 싱글룸 입장 확인 창도 같은 창을 쓰고 문구만 props로 바꾼다.
 * 미리보기 높이는 2026-08-25 BY-427 시안 B(234px) 확정.
 */
export interface CameraOnConfirmDialogProps {
  open: boolean;
  /** 미리보기 슬롯 — 호출부가 소유한 카메라 `<video>`를 넘긴다(다이얼로그는 표시만). */
  preview: ReactNode;
  /**
   * 얼굴 가리기 설정
   *
   * 넘기면 미리보기 아래에 스위치와 이모지 선택을 그린다.
   * 미리보기는 호출부가 이 값에 맞는 영상으로 바꾼다.
   */
  faceMask?: {
    supported: boolean;
    on: boolean;
    onChange: (on: boolean) => void;
    emojis: readonly FaceMaskEmoji[];
    emojiId: string;
    onEmojiChange: (id: string) => void;
    /** 안내 아이콘 툴팁의 줄들. 기본은 소셜룸 문구다. */
    tooltip?: readonly string[];
    /** 스위치 아래 보조 문구. 없으면 그리지 않는다. */
    caption?: string;
  };
  /** 인라인 오류(입장 재시도 실패 등). 없으면 표시하지 않는다. */
  errorMessage?: string | null;
  /**
   * false면 Escape를 무시한다. 입장 확인처럼 취소가 곧 하나의 선택(끄고 입장)인 자리에서
   * Esc가 그 선택을 확정해 버리는 것을 막는다 — 버튼 탭으로만 결정하게 한다.
   */
  dismissable?: boolean;
  /** 확정 처리 중 — 두 버튼과 Escape를 잠가 중복 확정을 막는다. */
  busy?: boolean;
  /** 제목. 기본은 소셜룸 문구다. */
  title?: string;
  /**
   * 제목 아래 설명
   *
   * 없으면 자물쇠 줄이 제목 아래로 올라와 창 설명을 맡는다(소셜룸).
   * 있으면 설명은 제목 아래, 자물쇠 줄은 버튼 위에 둔다(싱글룸).
   */
  description?: string;
  /** 자물쇠 줄. 싱글룸과 소셜룸은 영상이 가는 곳이 달라 문구가 다르다. */
  notice?: string;
  /** 확정 버튼 글자 */
  confirmLabel?: string;
  cancelLabel?: string;
  /** 포털이 그려질 자리 — 세션 루트를 넘긴다. 생략하면 `body`. */
  container?: HTMLElement | null;
  /**
   * 열 때 포커스가 있던 요소가 없거나 닫힐 때 사라졌으면 대신 포커스를 받을 요소
   *
   * 페이지 안 버튼으로 연 창은 그 페이지가 함께 닫혀 돌아갈 자리가 없다.
   */
  returnFocus?: () => HTMLElement | null;
  onCancel: () => void;
  onConfirm: () => void;
}

// 이모지 줄은 옆으로 넘기는 한 줄이라, 뒤쪽 이모지를 고른 채 다시 열면 고른 칸이 줄 밖에 가려진다.
export function CameraOnConfirmDialog({
  open,
  preview,
  faceMask,
  errorMessage = null,
  dismissable = true,
  busy = false,
  title,
  description,
  notice,
  confirmLabel,
  cancelLabel,
  container,
  returnFocus,
  onCancel,
  onConfirm,
}: CameraOnConfirmDialogProps) {
  const { t } = useTranslation(["live-room", "common"]);
  // 기본 문구는 소셜룸 것이다. 싱글룸은 영상이 기기 밖으로 나가지 않아 자물쇠 줄을 props로 바꿔 넘긴다.
  const shownNotice = notice ?? t("cameraConfirm.notice");
  // 발열 줄은 소셜룸 송신 합성 때문이라 싱글룸은 첫 줄만 넘긴다.
  const socialFaceMaskTooltip = [t("cameraConfirm.tooltipMotion"), t("cameraConfirm.tooltipHeat")];
  const focusRestore = useDialogFocusRestore(returnFocus);
  const cancelRef = useRef<HTMLButtonElement>(null);
  // 모달은 스크롤 영역이라 밖으로 나간 툴팁이 잘린다. 툴팁이 모달 안쪽에서 자리를 잡게 경계로 넘긴다.
  const [contentEl, setContentEl] = useState<HTMLDivElement | null>(null);
  // 취소가 곧 하나의 선택(끄고 입장)인 자리다. 확정 중이거나 닫기를 막아 둔 동안에는
  // Escape 로 그 선택이 확정되지 않게 한다.
  const escapeAllowed = dismissable && !busy;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent
        ref={setContentEl}
        role="alertdialog"
        container={container}
        showCloseButton={false}
        onEscapeKeyDown={(event) => {
          if (!escapeAllowed) event.preventDefault();
        }}
        // 딤 탭으로는 닫지 않는다. 버튼으로만 결정하게 한다.
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        // Radix는 처음 누를 수 있는 요소에 포커스를 주는데, 그게 안내 아이콘이면 창이 열리자마자 툴팁이 뜬다.
        onOpenAutoFocus={(event) => {
          focusRestore.onOpenAutoFocus();
          event.preventDefault();
          cancelRef.current?.focus();
        }}
        onCloseAutoFocus={focusRestore.onCloseAutoFocus}
        // max-h+스크롤: 어떤 화면(특히 가로 회전)에서도 모달이 뷰포트를 넘어 잘리지 않는
        // 백스톱이다 — 내용은 아래 미리보기 높이가 비례로 줄어 대부분 스크롤 없이 들어간다.
        // gap-0 으로 DialogContent 기본 grid gap 을 눌러 아래 mt-* 간격을 그대로 쓴다.
        // 낮은 가로 화면은 미리보기를 왼쪽 칸에 세워 높이를 절반 가까이 줄인다. 한 줄로 쌓으면 스크롤해야 버튼이 보인다.
        className="theme-soft-blue max-h-[calc(100dvh-24px)] w-full max-w-[320px] gap-0 landscape-compact:max-w-[600px] landscape-compact:grid-cols-2 landscape-compact:gap-x-5 overflow-y-auto rounded-3xl border-0 bg-muted px-5.5 pt-6.5 pb-5.5 text-foreground shadow-[0_20px_25px_rgba(0,0,0,0.4)] sm:rounded-3xl"
      >
        <DialogTitle className="text-[19px] leading-5.75 font-extrabold text-foreground landscape-compact:col-start-2">
          {title ?? t("cameraConfirm.title")}
        </DialogTitle>
        {/* 설명이 없으면 자물쇠 줄을 제목 바로 아래로 올려 창 설명으로 쓴다. 누가 보는지와 남지 않는다는 것을 미리보기보다 먼저 읽게 한다. */}
        {description === undefined ? (
          <DialogDescription className="mt-2 flex items-center gap-2 text-sm leading-5 text-muted-foreground landscape-compact:col-start-2">
            <Lock size={16} aria-hidden className="shrink-0" />
            {shownNotice}
          </DialogDescription>
        ) : (
          <DialogDescription className="mt-2 text-sm leading-5 text-muted-foreground landscape-compact:col-start-2">
            {description}
          </DialogDescription>
        )}
        {/* 미리보기 높이는 화면 높이 비례(28dvh ≈ 표준 세로에서 234px) + 상한 234px —
            고정 px는 가로 회전(높이 ~390px)에서 모달을 뷰포트 밖으로 밀어 잘리게 했고,
            기기별로도 다르게 보였다(2026-08-25 피드백). 시안 B의 234px는 상한으로 유지. */}
        {/* 가로 두 칸에서는 오른쪽 칸 높이에 맞춰 늘어나야 해서, 영상이 칸 높이를 밀어 올리지 않게 안쪽을 띄운다. */}
        <div className="relative mt-3 h-[min(234px,28dvh)] overflow-hidden rounded-[18px] bg-[#1e2632] landscape-compact:col-start-1 landscape-compact:row-span-6 landscape-compact:row-start-1 landscape-compact:mt-0 landscape-compact:h-auto">
          <div className="size-full landscape-compact:absolute landscape-compact:inset-0">
            {preview}
          </div>
        </div>
        {/* grid 칸은 기본으로 내용보다 좁아지지 않아, 줄바꿈하지 않는 이모지 줄 폭만큼 창 전체가 넓어진다. */}
        {faceMask !== undefined && (
          <div className="mt-3 min-w-0 landscape-compact:col-start-2">
            <div className="flex min-h-11 items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <label htmlFor="camera-face-mask" className="text-sm font-semibold text-foreground">
                  {t("cameraConfirm.faceMask")}
                </label>
                {faceMask.supported && (
                  <InfoTooltip
                    label={t("cameraConfirm.aria.faceMaskInfo")}
                    contentClassName="bg-(--session-dialog-cancel-bg) text-white"
                    collisionBoundary={contentEl}
                  >
                    {(faceMask.tooltip ?? socialFaceMaskTooltip).map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                  </InfoTooltip>
                )}
              </div>
              <Switch
                id="camera-face-mask"
                checked={faceMask.on}
                disabled={!faceMask.supported}
                onCheckedChange={faceMask.onChange}
              />
            </div>
            {!faceMask.supported && (
              <p className="text-[13px] text-muted-foreground">
                {t("cameraConfirm.faceMaskUnsupported")}
              </p>
            )}
            {faceMask.caption !== undefined && (
              <p className="text-[13px] text-muted-foreground">{faceMask.caption}</p>
            )}
            {/* 스위치를 꺼도 줄을 남겨 두어 켜고 끌 때 창 높이가 바뀌지 않게 한다. */}
            {faceMask.supported && (
              <FaceMaskEmojiPicker
                emojis={faceMask.emojis}
                value={faceMask.emojiId}
                disabled={!faceMask.on}
                onChange={faceMask.onEmojiChange}
                // 오른쪽은 창 끝까지 늘려 잘린 칸이 보이게 한다.
                className="mt-2 -mr-5.5 pr-5.5"
              />
            )}
          </div>
        )}
        {description !== undefined && (
          <div className="mt-3 flex items-center gap-2 landscape-compact:col-start-2">
            <Lock size={16} aria-hidden className="text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{shownNotice}</p>
          </div>
        )}
        {errorMessage !== null && (
          <p
            role="alert"
            className="mt-2 text-sm text-state-distract-text landscape-compact:col-start-2"
          >
            {errorMessage}
          </p>
        )}
        <div className="mt-4 flex gap-2 landscape-compact:col-start-2">
          <Button
            ref={cancelRef}
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={onCancel}
            className="h-13 flex-1 rounded-lg bg-bg-layer-2 text-[15px] leading-5 font-semibold whitespace-pre-line text-foreground"
          >
            {cancelLabel ?? t("common:actions.cancel")}
          </Button>
          <Button
            type="button"
            variant="default"
            disabled={busy}
            onClick={onConfirm}
            className="h-13 flex-1 rounded-lg text-[15px] font-semibold"
          >
            {confirmLabel ?? t("cameraConfirm.confirm")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
