import { Clock } from "lucide-react";

/**
 * 신청 중인 공개 그룹 띠
 *
 * 숫자는 답을 기다리는 신청 수이고, 신청이 없으면 띠를 그리지 않는다.
 */
export function PendingBand({ count, onOpen }: { count: number; onOpen: () => void }) {
  if (count <= 0) {
    return null;
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-12 w-full shrink-0 items-center gap-2 rounded-[14px] bg-brand-subtle px-3.5 text-left text-primary focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none"
    >
      <Clock aria-hidden="true" size={16} className="shrink-0" />
      <span className="text-sm leading-5 font-bold">신청 중인 공개 그룹 {count}</span>
      <span aria-hidden="true" className="ml-auto text-lg leading-5.5 font-semibold">
        ›
      </span>
    </button>
  );
}
