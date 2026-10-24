/**
 * 멀티 타이머 아이콘
 *
 * 경로는 피그마에서 내보낸 원본 그대로이고 색만 currentColor로 바꿔 부모가 정한다.
 * 앱 glass 버튼의 뽀모도로 그림(`apps/mobile/modules/web-glass/ios/Assets/pomodoro*.png`)도 같은 경로를 렌더한 것이라 경로를 바꾸면 함께 다시 만든다.
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

export function PomodoroIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <path
        d="M16.25 11.6667C16.25 15.1184 13.4518 17.9167 10 17.9167C6.54822 17.9167 3.75 15.1184 3.75 11.6667C3.75 8.21489 6.54822 5.41667 10 5.41667C13.4518 5.41667 16.25 8.21489 16.25 11.6667Z"
        stroke="currentColor"
        strokeWidth={1.41667}
      />
      <path
        d="M10 5.41667V2.91667"
        stroke="currentColor"
        strokeWidth={1.41667}
        strokeLinecap="round"
      />
      <path
        d="M7.08333 4.33333C8.08333 5.16667 9 5.41667 10 5.41667C11 5.41667 11.9167 5.16667 12.9167 4.33333"
        stroke="currentColor"
        strokeWidth={1.41667}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 11.6667V7.5C10.67 7.49944 11.3302 7.66045 11.9248 7.96939C12.5193 8.27833 13.0305 8.72608 13.4152 9.27467C13.7998 9.82327 14.0465 10.4565 14.1342 11.1207C14.222 11.785 14.1483 12.4606 13.9194 13.0902C13.6905 13.7199 13.3131 14.2851 12.8193 14.7379C12.3254 15.1907 11.7297 15.5177 11.0826 15.6912C10.4354 15.8647 9.75597 15.8796 9.10185 15.7346C8.44773 15.5896 7.83822 15.289 7.325 14.8583L10 11.6667Z"
        fill="currentColor"
      />
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
