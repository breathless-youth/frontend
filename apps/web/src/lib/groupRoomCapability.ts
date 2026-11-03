// 앱 안에서 이동하면 주소에서 쿼리가 빠지므로 모듈을 불러올 때 한 번 읽어 기억한다.
// 표시는 바이너리마다 고정이라 다시 읽을 이유가 없다.
function readGroupRoomsFlag(): boolean {
  return new URLSearchParams(window.location.search).get("groupRooms") === "1";
}

let groupRoomsFlagCache: boolean | null = readGroupRoomsFlag();

/**
 * 그룹 공부방 흐름을 여는지
 *
 * 셸이 웹뷰 주소에 싣는 `groupRooms=1`로 정하고, 셸이 없는 브라우저도 같은 표시를 따른다.
 * 개발 서버는 표시가 없어도 참이다.
 * `DEV`가 아니라 `MODE`를 보는 것은 vitest에서도 `DEV`가 참이라 `<App />`을 그리는 기존 소셜 테스트가 새 흐름으로 바뀌기 때문이다.
 */
export function hasGroupRooms(): boolean {
  if (import.meta.env.MODE === "development") {
    return true;
  }
  groupRoomsFlagCache ??= readGroupRoomsFlag();
  return groupRoomsFlagCache;
}

/**
 * 테스트용 그룹 공부방 판정 초기화
 *
 * 테스트마다 주소를 바꿔 판정하도록 기억한 값을 비운다.
 */
export function __resetGroupRoomsForTests(): void {
  groupRoomsFlagCache = null;
}
