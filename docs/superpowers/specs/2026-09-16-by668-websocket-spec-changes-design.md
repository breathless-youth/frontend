# BY-668 웹소켓 명세 변경 반영 — 설계

백엔드 BY-626(룸 상태 DB 원본화)로 STOMP 계약이 바뀌었다. 그 계약의 권위 있는 출처는
BY-626 티켓 본문이 아니라 백엔드 담당(권상재)이 단 댓글이다. 이 문서는 그 계약 중 프론트에
남은 세 가지를 어떻게 반영할지 정한다.

## 이미 끝난 것

`studySeconds` → `focusSec` 이름 변경은 프론트에 이미 반영돼 있다. `packages/types/src/room.ts`의
`RoomMember`·`STUDY_TIME`·`RoomStateUpdate`가 전부 `focusSec`을 쓰고, live-room 소스에
`studySeconds`는 한 군데도 없다. 추가 작업이 없다.

## 반영할 세 가지

### 1. `members[]`의 `disconnected` 플래그 (데이터만)

계약: SNAPSHOT·MEMBER_JOINED의 `members[]` 원소에 `disconnected: boolean`이 추가된다.
`true`면 소켓이 끊겨 30초 유예 중인 멤버다. 백엔드는 "재접속 중" 표시를 선택 사항으로 열어 뒀다.

결정: 데이터로만 받고 타일 UI는 바꾸지 않는다. 30초 유예가 끝나면 서버가 MEMBER_LEFT로
멤버를 지우므로 유령 타일이 오래 남지 않는다. "재접속 중" 라벨은 Figma에 없는 새 상태라
필요해지면 별도 티켓에서 다룬다.

- `RoomMember`에 `disconnected?: boolean`을 더한다.
- `stompRoomChannel`의 `isRoomMember` 검증이 `disconnected`를 boolean 또는 없음으로 받는다.
- 리듀서는 손대지 않는다. `disconnected`는 멤버 객체에 실려 SNAPSHOT·MEMBER_JOINED 경로로
  그대로 흐른다. CAMERA/FOCUS/STUDY_TIME 부분 갱신은 이 값을 건드리지 않는다.

### 2. 피어 실패 시 SNAPSHOT 10초 주기 재대조

계약: 피어 연결이 `disconnected` 또는 `failed`인 동안 `/app/room/{id}/snapshot`을 10초 주기로
재요청한다. 배포 겹침 구간에 태스크 간 메시지 릴레이가 없어 생기는 유령 멤버를 보완한다.

배치: ICE 상태를 아는 곳은 `peerMesh`다. 스냅샷 재대조는 미디어 경로 복구(ICE restart)와 다른
관심사지만 같은 조건(피어가 disconnected·failed)에서 켜지므로, ICE 상태를 이미 다루는 `peerMesh`가
맡는 것이 가장 작은 변경이다.

- `RoomChannel` 인터페이스에 `requestSnapshot(): void`를 더한다. 구현은 `/app/room/{id}/snapshot`으로
  본문 없는 발행 하나다. 기존 워치독의 스케줄·재연결 로직과 얽지 않는 순수 발행이다.
- `peerMesh`가 열화된 피어 집합을 관리한다. ICE가 `disconnected`·`failed`가 되면 집합에 넣고,
  `connected`가 되거나 피어가 정리되면 뺀다.
- 집합이 비지 않은 동안 10초 간격 타이머가 `channel.requestSnapshot()`을 부른다. 집합이 비면
  타이머를 멈춘다. `close`·`resetConnections`에서도 정리한다.
- 리듀서는 SNAPSHOT에서 멤버 목록을 통째로 교체하므로 재대조는 멱등이다. 유령 멤버가 정리된다.

### 3. `ROOM_UNAVAILABLE` 수신과 join 재호출

계약: `/user/queue/room`으로 `{type: "ROOM_UNAVAILABLE", roomId}`가 올 수 있다. 방 토픽 구독이
거부됐거나 자리가 이미 회수된 경우다. join API를 다시 호출하거나 방을 닫고 안내를 띄운다.

결정: join을 한 번 재호출한다. 성공하면 채널을 재연결해 이어 가고, 실패하면 방을 닫고 안내를
띄운다. SNAPSHOT이 끝내 안 오는 경우도 같은 재호출로 escalate한다.

두 신호가 하나의 재호출 동작으로 모인다.

- ROOM_UNAVAILABLE 수신 → `requestRejoin()`
- SNAPSHOT 미도착으로 채널 워치독의 강제 재연결 예산이 소진됨 → `requestRejoin()`

`requestRejoin`은 `renewLiveRoomSeat(userId, inviteCode)`로 자리를 다시 잡는다. in-flight 가드로
겹침을 막는다.

- 성공: `channel.reconnect()`. 재구독이 서버의 스냅샷 재발행을 부르고, 세션 타이머는 끊기지 않고
  계속 돈다(재호출은 세션 리마운트가 아니라 서버 자리 조작 + 채널 재연결이다).
- 실패: 자리가 진짜 회수된 상태다. 종료 처리로 넘어간다.

종료 처리(handleRoomUnavailable)는 기존 유예 만료 처리(handleGraceExpire)와 같은 모양이다.
측정한 순공 시간을 잃지 않게 제출하고, 안내를 남기고, 소셜 홈으로 보낸다.

- `channel.disconnect()`로 자동 재연결 경쟁을 끊는다.
- `endAndSubmit(autoEndReason("BACKGROUND"))`로 측정분을 제출한다(새 종료 사유를 만들지 않고
  기존 BACKGROUND 트리거를 쓴다).
- `markSocialRoomNotice(ROOM_UNAVAILABLE_MESSAGE)`로 도착지 안내를 남긴다.
- 기존 done/error 네비게이션 effect가 소셜 홈으로 보낸다. 이 경로는 focusSec와 무관하게 항상
  소셜 홈으로 가도록 `roomUnavailable` 조건을 더한다(유예 만료의 `expired` 조건과 같은 자리).

## 배선

`ROOM_UNAVAILABLE`은 세션이 도는 중 STOMP로 온다. 그런데 join에 필요한 `inviteCode`는 지금
`LiveRoomEntry`의 `entryState`에만 있고 `LiveRoomSession`으로 넘어가지 않는다.

- `LiveRoomEntry`가 `inviteCode`를 `LiveRoomSession`에 prop으로 넘긴다.
- `LiveRoomSession`이 `requestRejoin`·종료 처리를 소유한다(채널·navigate·notice를 이미 다 가진 곳).
- 채널의 SNAPSHOT 미도착 escalation은 채널이 위로 알려야 한다. `createStompRoomChannel` 옵션에
  `onSnapshotUnrecovered?: () => void`를 더하고, 워치독이 강제 재연결 예산을 소진한 지점에서
  한 번 부른다(재발행 드라우트마다 1회 가드). 채널은 한 번만 생성되므로 ref로 최신 콜백을 가리킨다.
- `CreateChannel` 타입과 기본 `createChannel`은 옵션 객체를 그대로 전달하게 바꾼다. 옵션 필드가
  선택이라 mock·테스트는 영향받지 않는다.

## 타입·검증

- `RoomServerMessage`에 `{ type: "ROOM_UNAVAILABLE"; roomId: number }`를 더한다.
- `isRoomServerMessage`에 `ROOM_UNAVAILABLE` 분기를 더한다(`roomId`가 number).
- 리듀서 기본 분기가 ROOM_UNAVAILABLE에서 멤버 목록을 그대로 둔다(멤버 메시지가 아니다).
- `peerMesh`의 메시지 처리도 기본 분기로 무시한다.
- `mockRoomChannel`에 `requestSnapshot()`을 더한다(인터페이스 구현).

## 테스트 (동작 기준)

- `stompRoomChannel.test.ts`
  - `isRoomServerMessage`가 ROOM_UNAVAILABLE을 받고, roomId 없는 것은 버린다.
  - `isRoomMember`가 `disconnected` boolean을 받고, boolean 아닌 값은 버린다.
  - `requestSnapshot()`이 `/app/room/{id}/snapshot`으로 발행한다.
  - SNAPSHOT을 끝내 안 주면 강제 재연결 예산 소진 뒤 `onSnapshotUnrecovered`가 1회 불린다(fake timers).
- `roomMembersReducer.test.ts`
  - SNAPSHOT·MEMBER_JOINED가 `disconnected`를 보존한다.
  - ROOM_UNAVAILABLE이 멤버 목록을 바꾸지 않는다.
- `peerMesh.test.ts`
  - 피어가 disconnected·failed가 되면 10초마다 `channel.requestSnapshot()`이 불린다.
  - 피어가 connected로 돌아오거나 close되면 재대조가 멈춘다.
- rejoin 동작(`useRoomRejoin` 단위 또는 `LiveRoomPage` 통합, 5-1에서 확정)
  - ROOM_UNAVAILABLE 수신 → `renewLiveRoomSeat` 호출 → 성공 시 `channel.reconnect`.
  - 재호출 실패 → 제출 + 안내 + 소셜 홈 이동.
  - 겹친 신호는 in-flight 가드로 한 번만 재호출한다.

## 범위 밖

- "재접속 중" 시각 표시(필요 시 별도 티켓).
- 배포 겹침 구간의 태스크 간 메시지 릴레이(백엔드 별도 티켓, BY-626 범위 밖).
