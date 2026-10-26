/**
 * 멀티 타이머 아이콘
 *
 * 경로는 피그마에서 내보낸 원본 그대로이고 색만 currentColor로 바꿔 부모가 정한다.
 */

interface IconProps {
  className?: string;
}

export function TimerIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <path
        d="M16.5 11.5C16.5 15.0899 13.5899 18 10 18C6.41015 18 3.5 15.0899 3.5 11.5C3.5 7.91015 6.41015 5 10 5C13.5899 5 16.5 7.91015 16.5 11.5Z"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
      />
      <path d="M10 11.5V8M8 2.5H12" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" />
    </svg>
  );
}

export function CloseIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 13 13" fill="none" aria-hidden="true" className={className}>
      <path
        d="M1.85714 1.85714L11.1429 11.1429M11.1429 1.85714L1.85714 11.1429"
        stroke="currentColor"
        strokeWidth={1.67143}
        strokeLinecap="round"
      />
    </svg>
  );
}
