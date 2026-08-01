/**
 * 세션 종료 안내 공용 체크 아이콘 원형 (Figma `check-circle` 63:587 + `icon/check` 63:588).
 *
 * 두 종료 안내가 같은 시각 언어를 공유한다 — S3-8 자동 종료(`AutoEndNotice`, Figma 원본)와
 * 1분 미만 종료(`SubMinuteEndNotice`, 2026-08-01 사용자 확인으로 동일 아이콘 추가 — BY-336).
 * 원래 AutoEndNotice의 비공개 컴포넌트였고 공유가 생기면서 파일로 분리했다.
 *
 * SVG path는 Figma export(`icon/check` 63:588)에서 **그대로 옮긴 값**이다 — 손으로 그리지
 * 않는다. 유일한 변경은 `stroke`를 `#1B64DA`(= `brand/primary`의 라이트 값)에서
 * `currentColor`로 바꾼 것이다: 두 화면 모두 테마 반응형이라 다크에서 아이콘도 `brand/primary`의
 * 다크 값(#3182F6)을 따라가야 하는데, 색을 박아 두면 다크 서피스에서 어두운 파랑이 남는다.
 * 색은 부모의 `text-primary`가 준다.
 *
 * PNG로 내보내지 않는 이유: Figma PNG 익스포트에는 캔버스 배경 `<rect>`가 합성돼 아이콘이
 * 흰 네모로 보인다(MG1에서 실제 발생).
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
      <span className="flex size-[28px] items-center justify-center">
        <svg
          width="19.1333"
          height="14.4667"
          viewBox="0 0 19.1333 14.4667"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          focusable="false"
        >
          <path
            d="M1.4 7.23335L7.23333 13.0667L17.7333 1.40001"
            stroke="currentColor"
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </span>
  );
}
