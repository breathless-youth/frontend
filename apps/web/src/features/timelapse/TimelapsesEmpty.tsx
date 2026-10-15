/** 보관 중인 타임랩스가 없을 때의 안내. 홈 목록과 전체 목록이 함께 쓴다. */
export function TimelapsesEmpty() {
  return (
    <p className="bg-muted text-muted-foreground shadow-sb-card rounded-[20px] px-5 py-6 text-center text-sm">
      공부를 완료하고 공부한 모습을 공유해보세요
    </p>
  );
}
