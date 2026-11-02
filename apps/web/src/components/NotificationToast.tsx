/**
 * 앱을 쓰는 중에 온 그룹 알림 토스트의 내용
 *
 * 제목과 본문을 두 줄로 보이고, 토스트 알약 전체가 한 버튼이라 어디를 눌러도 알림이 가리키는 화면으로 간다.
 * 색과 모양은 전역 토스트 알약을 그대로 쓰고 문구는 서버가 보낸 그대로다.
 * 누른 뒤 토스트를 닫는 일은 `showNotificationToast`가 `onOpen`을 감싸 맡는다.
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
      aria-label={`${title}. ${body}`}
      onClick={onOpen}
      // 알약의 안쪽 여백까지 누를 수 있게 그 여백만큼 바깥으로 넓힌다.
      className="-mx-4 -my-2 flex flex-col items-center px-4 py-2 text-center"
    >
      <span className="font-semibold">{title}</span>
      <span>{body}</span>
    </button>
  );
}
