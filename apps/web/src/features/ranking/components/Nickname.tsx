import { useEffect, useId, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * 한 줄 닉네임
 *
 * 칸 폭에서 말줄임하고, 실제로 잘렸을 때만 눌러서 전체 이름 말풍선을 연다.
 * 잘렸는지는 크기가 바뀔 때마다 다시 측정한다.
 * 누르는 영역은 글자 줄 높이와 상관없이 44px로 둔다.
 */
export function Nickname({ name, className }: { name: string; className?: string }) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [truncated, setTruncated] = useState(false);
  const [open, setOpen] = useState(false);
  const bubbleId = useId();

  useEffect(() => {
    const element = textRef.current;
    if (element === null) {
      return;
    }
    const measure = () => {
      setTruncated(element.scrollWidth > element.clientWidth);
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
  }, [name]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const closeOnOutside = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOnOutside);
    return () => document.removeEventListener("pointerdown", closeOnOutside);
  }, [open]);

  const showBubble = open && truncated;

  return (
    <span ref={wrapRef} className={cn("relative block min-w-0", className)}>
      <span ref={textRef} className="block truncate">
        {name}
      </span>
      {truncated && (
        <button
          type="button"
          aria-label={`${name} 전체 이름 보기`}
          aria-expanded={showBubble}
          aria-describedby={showBubble ? bubbleId : undefined}
          onClick={() => setOpen((value) => !value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
            }
          }}
          className="absolute inset-x-0 top-1/2 h-11 -translate-y-1/2 rounded-md focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none"
        />
      )}
      {showBubble && (
        <span
          id={bubbleId}
          role="tooltip"
          className="absolute bottom-full left-0 z-10 mb-1.5 max-w-55 rounded-[10px] bg-foreground px-2.5 py-2 text-left text-[13px] leading-4 font-semibold break-all whitespace-normal text-background"
        >
          {name}
        </span>
      )}
    </span>
  );
}
