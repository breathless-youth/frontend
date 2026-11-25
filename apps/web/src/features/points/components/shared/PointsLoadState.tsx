import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";

/** 데이터를 받기 전의 자리표시와 받지 못했을 때의 다시 시도 */
export function PointsLoadState({
  failed,
  message,
  onRetry,
}: {
  failed: boolean;
  message: string;
  onRetry: () => void;
}) {
  if (failed) {
    return (
      <div className="pt-4">
        <ErrorState message={message} onRetry={onRetry} screen="points" />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3 pt-4">
      <Skeleton className="h-23 rounded-lg" />
      <Skeleton className="h-45 rounded-lg" />
    </div>
  );
}
