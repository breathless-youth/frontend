import { LinkIcon, RefreshCw } from "lucide-react";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * 비공개 그룹 초대 카드
 *
 * 링크나 코드를 받은 사람은 수락 없이 바로 멤버가 되므로 그 사실을 코드 바로 위에 둔다.
 * 코드 새로 만들기는 그룹장만 할 수 있어 `canRegenerate`일 때만 두고, 그 아래에는 설명을 두지 않는다.
 * 좁은 폰에서는 코드가 링크 버튼에 밀려 넘치지 않게 카드 폭을 보고 글자를 줄인다.
 */
export function InviteCard({
  code,
  canRegenerate,
  onShareLink,
  onRegenerate,
}: {
  code: string;
  canRegenerate: boolean;
  onShareLink: () => void;
  onRegenerate: () => void;
}) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        "@container flex flex-col gap-3 rounded-xl bg-muted px-4 pt-4 shadow-sb-card",
        canRegenerate && "pb-1.5",
        !canRegenerate && "pb-4",
      )}
    >
      <div className="flex flex-col gap-0.5">
        <h2 id={titleId} className="text-[15px] leading-5.5 font-bold text-foreground">
          초대하기
        </h2>
        <p className="text-[13px] leading-5 break-keep text-muted-foreground">
          링크나 코드를 받은 사람은 수락 없이 바로 멤버가 돼요
        </p>
      </div>
      <div className="flex items-center gap-2">
        <p className="flex h-13 min-w-0 flex-1 items-center justify-center rounded-lg bg-bg-layer-2 text-2xl leading-7.5 font-extrabold tracking-[6px] text-foreground tabular-nums @max-2xs:text-xl @max-2xs:tracking-[3px]">
          <span className="sr-only">초대코드 </span>
          {code}
        </p>
        <Button
          onClick={onShareLink}
          className="h-13 shrink-0 gap-1.5 rounded-lg px-4 text-[15px] font-bold"
        >
          <LinkIcon aria-hidden="true" size={18} />
          링크 보내기
        </Button>
      </div>
      {canRegenerate && (
        // 글자 높이만큼만 자리를 차지하면서 누르는 영역은 44px을 지키도록 위로 겹친다.
        <button
          type="button"
          onClick={onRegenerate}
          className="-mt-1.5 flex min-h-11 items-center gap-1.5 self-start rounded-sm text-sm leading-5 font-bold text-primary focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none"
        >
          <RefreshCw aria-hidden="true" size={16} strokeWidth={2.2} />
          코드 새로 만들기
        </button>
      )}
    </section>
  );
}
