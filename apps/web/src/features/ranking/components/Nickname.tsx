import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { TapTooltip } from "@/components/ui/InfoTooltip";
import { cn } from "@/lib/utils";

/**
 * 닉네임
 *
 * 칸 폭에서 정한 줄 수만큼 보이고 말줄임하며, 실제로 잘렸을 때만 눌러서 전체 이름 말풍선을 연다.
 * 두 줄이면 띄어쓰기 없는 긴 영문도 칸 안에서 줄을 바꾼다.
 * 잘렸는지는 크기가 바뀔 때마다 다시 측정한다.
 * 누르는 영역은 글자 줄 높이와 상관없이 44px로 둔다.
 * 시상대 카드가 overflow-hidden이라 말풍선은 문서 맨 위 층에 그리고, 화면 끝에서는 Radix가 뒤집거나 민다.
 */
export function Nickname({
  name,
  className,
  lines = 1,
}: {
  name: string;
  className?: string;
  lines?: 1 | 2;
}) {
  const { t } = useTranslation("ranking");
  const textRef = useRef<HTMLSpanElement>(null);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    const element = textRef.current;
    if (element === null) {
      return;
    }
    // 두 줄은 줄을 바꿔 아래로 넘치므로 높이로 잰다.
    const measure = () => {
      setTruncated(
        lines === 2
          ? element.scrollHeight > element.clientHeight
          : element.scrollWidth > element.clientWidth,
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    // 글꼴 조각이 늦게 와 폭이 바뀌어도 상자 크기는 그대로라 글꼴 로딩이 끝날 때도 다시 측정한다.
    const fonts = document.fonts as FontFaceSet | undefined;
    fonts?.addEventListener("loadingdone", measure);
    return () => {
      observer.disconnect();
      fonts?.removeEventListener("loadingdone", measure);
    };
  }, [name, lines]);

  return (
    <span className={cn("relative block min-w-0", className)}>
      <span
        ref={textRef}
        className={lines === 2 ? "line-clamp-2 wrap-break-word" : "block truncate"}
      >
        {name}
      </span>
      {truncated && (
        <TapTooltip
          portal
          // 화면 끝에 붙지 않게 카드 바깥 여백만큼 띄운다.
          collisionPadding={12}
          // 문서 맨 위 층은 화면의 soft-blue 변수를 못 읽어 같은 클래스로 이전 말풍선 색을 맞춘다.
          contentClassName="theme-soft-blue max-w-55 rounded-[10px] bg-foreground px-2.5 py-2 text-left text-[13px] leading-4 font-semibold break-all whitespace-normal text-background shadow-none"
          trigger={
            <button
              type="button"
              aria-label={t("nickname.aria.showFull", { name })}
              className="absolute inset-x-0 top-1/2 h-11 -translate-y-1/2 touch-manipulation rounded-md focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none"
            />
          }
        >
          {name}
        </TapTooltip>
      )}
    </span>
  );
}
