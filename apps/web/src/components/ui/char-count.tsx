import { cn } from "@/lib/utils";

/**
 * 글자 수 표시가 그려지는지
 *
 * 입력칸의 aria-describedby가 그려지지 않은 id를 가리키지 않도록 호출부도 같은 판정을 쓴다.
 */
function isCharCountVisible(length: number, max: number, showFrom = 0) {
  return length >= max * showFrom;
}

/**
 * 입력칸 글자 수 표시
 *
 * 한도에서 입력을 버리면 iOS 한글 자판이 기억하는 글자와 입력칸 값이 어긋나 앞 글자가 덮어써진다.
 * 그래서 입력은 막지 않고 글자 수와 초과 문구로 알린다.
 * 초과 문구는 초과 상태로 들어갈 때 한 번만 읽히도록 alert로 그린다.
 */
function CharCount({
  id,
  length,
  max,
  showFrom = 0,
  overMessage,
  className,
}: {
  id: string;
  length: number;
  max: number;
  /**
   * 한도 대비 이 비율부터 보인다.
   * 긴 칸에 숫자가 늘 떠 있으면 화면이 번잡하다.
   */
  showFrom?: number;
  overMessage?: string;
  className?: string;
}) {
  if (!isCharCountVisible(length, max, showFrom)) {
    return null;
  }
  const over = length > max;
  return (
    <div
      id={id}
      data-slot="char-count"
      className={cn("flex items-start justify-end gap-2 text-xs text-text-tertiary", className)}
    >
      {over && overMessage !== undefined && (
        <p role="alert" className="mr-auto text-state-distract-text">
          {overMessage}
        </p>
      )}
      <span className={cn("shrink-0 tabular-nums", over && "text-state-distract-text")}>
        {length}/{max}
      </span>
    </div>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- 입력칸이 CharCount와 같은 표시 판정을 써야 해서 함께 둔다
export { CharCount, isCharCountVisible };
