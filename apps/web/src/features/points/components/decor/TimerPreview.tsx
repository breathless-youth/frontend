import { useTranslation } from "react-i18next";

import type { ShopItem } from "../../types";

// 실제 타이머가 아니라 배경 위에 글자가 어떻게 앉는지 보이는 견본 시간이다.
const SAMPLE_TIME = "1:12:30";

/** 고른 배경을 깐 어두운 타이머 미리 보기 */
export function TimerPreview({ item }: { item: ShopItem | undefined }) {
  const { t } = useTranslation("points-decor");
  return (
    <div className="relative flex h-37.5 flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl bg-neutral-900 text-white">
      {item?.imageUrl ? (
        <img
          src={item.imageUrl}
          alt=""
          aria-hidden
          draggable={false}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <div
          aria-hidden
          className="absolute inset-2.5 rounded-[14px] border border-dashed border-white/35"
        />
      )}
      <span className="relative text-xs opacity-80">{t("preview.label")}</span>
      <span className="relative text-4xl font-bold tabular-nums">{SAMPLE_TIME}</span>
    </div>
  );
}
