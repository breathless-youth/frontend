import { useTranslation } from "react-i18next";

import { trackSessionBannerClicked } from "@/lib/amplitude";
import { cn } from "@/lib/utils";

import { SESSION_BANNER_COPY_KEYS, type SessionBannerCopy } from "./sessionBanner";

/**
 * 세션 화면 하단의 한 줄 배너
 *
 * 놓인 자리를 꽉 채우고 글자는 아래 끝 가운데에 둔다(`className`으로 바꿀 수 있다).
 * 자리를 넓혀 누르는 영역을 키우고, 자리보다 긴 문구는 잘리지 않고 양옆으로 넘친다.
 * `AD`는 광고라는 표시라서 스크린리더도 문구와 함께 읽는다.
 * 뒤의 전체 화면 탭 레이어에 누름이 닿지 않도록 스스로 `pointer-events-auto`다.
 * 문구는 같은 요소의 글자만 바뀌어 교체할 때 깜빡이지 않는다.
 */
export function SessionLineBanner({
  copy,
  onOpen,
  className,
}: {
  copy: SessionBannerCopy;
  onOpen: () => void;
  /** 글자 자리 등 버튼 모양을 덧씌운다. */
  className?: string;
}) {
  const { t } = useTranslation("study-session");
  return (
    <button
      type="button"
      onClick={() => {
        trackSessionBannerClicked({ copy });
        onOpen();
      }}
      className={cn(
        "pointer-events-auto flex size-full items-end justify-center gap-2 text-[13px] leading-4 whitespace-nowrap text-white/80",
        className,
      )}
    >
      <span className="rounded-md bg-white/14 px-1.5 py-0.5 text-[10px] leading-3 font-bold tracking-[0.4px] text-white/75">
        {t("banner.ad")}
      </span>{" "}
      <span>{t(SESSION_BANNER_COPY_KEYS[copy])}</span>
    </button>
  );
}
