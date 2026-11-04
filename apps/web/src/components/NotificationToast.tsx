/**
 * 화면 낭독기가 읽는 토스트 이름
 *
 * 제목과 본문을 끊어 읽게 마침표를 넣되, 제목이 이미 문장 부호로 끝나면 더하지 않는다.
 */
function accessibleName(title: string, body: string): string {
  return /[.?!]$/.test(title) ? `${title} ${body}` : `${title}. ${body}`;
}

/**
 * 앱을 쓰는 중에 온 그룹 알림 토스트의 내용
 *
 * 제목과 본문을 두 줄로 보이고, 토스트 알약 전체가 한 버튼이라 어디를 눌러도 알림이 가리키는 화면으로 간다.
 * 색과 모양은 전역 토스트 알약을 그대로 쓰고 문구는 서버가 보낸 그대로다.
 * 누른 뒤 토스트를 닫는 일은 `showNotificationToast`가 `onOpen`을 감싸 맡는다.
 * 문구에 다른 사람의 닉네임과 그룹 이름이 들어 있어 클릭 분석과 오류 기록에는 문구가 남지 않게 가린다.
 */
export function NotificationToast({
  title,
  body,
  onOpen,
}: {
  title: string;
  body: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={accessibleName(title, body)}
      // Amplitude 클릭 자동 수집이 싣는 버튼 글자와 aria-label을 가린다.
      data-amp-mask
      data-amp-mask-attributes="aria-label"
      // Sentry 클릭 기록은 aria-label 대신 이 이름을 적는다.
      data-sentry-element="NotificationToast"
      onClick={onOpen}
      // 알약의 안쪽 여백까지 누를 수 있게 그 여백만큼 바깥으로 넓힌다.
      className="-mx-4 -my-2 flex flex-col items-center px-4 py-2 text-center"
    >
      <span className="font-semibold">{title}</span>
      <span>{body}</span>
    </button>
  );
}
