import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

import { toggleShowOriginal, useShowOriginal } from "../model/groupTranslation";

/**
 * 그룹 글 번역 안내 한 줄
 *
 * 목록은 이름만 번역돼서 목록 문구를, 상세는 이름과 소개가 함께 바뀌어서 짧은 문구를 쓴다.
 * 버튼은 글자 높이만 차지하면서 누르는 영역 44px를 지키도록 위아래로 겹친다.
 * 그릴지는 번역된 글이 있는지 아는 부르는 쪽이 정한다.
 */
export function TranslationNotice({
  variant,
  className,
}: {
  variant: "list" | "detail";
  className?: string;
}) {
  const { t } = useTranslation("group-room");
  const showOriginal = useShowOriginal();
  const status =
    variant === "list"
      ? t(showOriginal ? "translationNotice.listOriginal" : "translationNotice.listTranslated")
      : t(showOriginal ? "translationNotice.detailOriginal" : "translationNotice.detailTranslated");
  return (
    <p
      className={cn(
        "flex flex-wrap items-center gap-x-1.5 text-[13px] leading-5 text-muted-foreground",
        className,
      )}
    >
      <Languages aria-hidden="true" size={14} className="shrink-0" />
      <span>{status}</span>
      <span aria-hidden="true" className="text-text-tertiary">
        ·
      </span>
      <button
        type="button"
        onClick={toggleShowOriginal}
        className="-my-3 flex h-11 items-center rounded-sm font-semibold text-primary focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none"
      >
        {t(showOriginal ? "translationNotice.seeTranslation" : "translationNotice.seeOriginal")}
      </button>
    </p>
  );
}
