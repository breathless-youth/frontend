import { LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * 가릴 위치를 찾는 동안 미리보기 가운데에 띄우는 배지
 *
 * 사람을 찾기 전의 흐림을 가리기 효과로 착각하지 않게 알린다.
 * 내 화면에만 그리고 보내는 영상에는 들어가지 않는다.
 */
export function FaceMaskSearchingBadge() {
  const { t } = useTranslation("live-room");
  return (
    <div role="status" className="absolute inset-0 flex items-center justify-center">
      <span className="flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 text-[13px] font-semibold text-white">
        <LoaderCircle size={14} aria-hidden className="animate-spin motion-reduce:animate-none" />
        {t("faceMask.searching")}
      </span>
    </div>
  );
}
