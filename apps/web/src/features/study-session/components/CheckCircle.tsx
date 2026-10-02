import { Check } from "lucide-react";

/**
 * 세션 종료 안내 공용 체크 아이콘 원형 (Figma `check-circle` 63:587 + `icon/check` 63:588).
 *
 * 두 종료 안내가 같은 시각 언어를 공유한다 — S3-8 자동 종료(`AutoEndNotice`, Figma 원본)와
 * 1분 미만 종료(`SubMinuteEndNotice`, 2026-08-01 사용자 확인으로 동일 아이콘 추가 — BY-336).
 * 원래 AutoEndNotice의 비공개 컴포넌트였고 공유가 생기면서 파일로 분리했다.
 *
 * 아이콘은 lucide `Check`다 — `stroke`는 `currentColor`를 따른다: 두 화면 모두 테마
 * 반응형이라 다크에서 아이콘도 `brand/primary`의 다크 값을 따라가야 하는데, 색을 박아 두면
 * 다크 서피스에서 어두운 파랑이 남는다. 색은 부모의 `text-primary`가 준다.
 *
 * 아이콘은 **장식**이다 — 의미는 타이틀 텍스트가 전달한다(아이콘 단독 전달 금지). 체크는
 * "공부가 끝났다"는 완료 신호이지 "기록이 저장됐다"는 뜻이 아니므로, 미달 화면의 문구
 * (`기록에 표시되지 않아요`)와 모순되지 않는다.
 */
export function CheckCircle() {
  return (
    <span
      aria-hidden="true"
      className="flex size-[66px] shrink-0 items-center justify-center rounded-full bg-brand-subtle text-primary"
    >
      <Check className="size-[28px]" strokeWidth={2.8} />
    </span>
  );
}
