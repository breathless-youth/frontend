# BY-488 프론트엔드 TURN 릴레이 측정 보고 설계

## 배경

WebRTC 연결이 실제로 TURN 릴레이(coturn 경유)를 타는 비율과 그로 인한 egress 비용을 아무도 모른다. coturn egress 비용은 릴레이 비율에 bitrate와 통화 시간을 곱해 정해지는데, 릴레이 비율이 측정되지 않아 STUN·IPv6·bitrate 최적화가 실제로 비용을 줄이는지 판단할 수 없다.

프론트에서 각 연결이 고른 경로 종류를 백엔드로 보고해 이 비율과 egress를 실측한다. 백엔드 수집 API는 `BY-490`으로 dev에 이미 반영됐다.

## 목표

- 각 PeerConnection이 고른 candidate pair의 local `candidateType`을 백엔드로 보고한다.
- `relay` 연결은 `relayProtocol`과 `bytesReceived`·`bytesSent`를 함께 실어 egress를 추정한다.
- 연결 성립 시 1회, 유지 중 60초 주기, 종료 시 마지막 1회 보고한다.
- 정상 종료(상대 퇴장·통화 종료·연결 재수립)에는 마지막 샘플을 한 번 보고한다.
- 하드 강제종료 시에는 `isFinal` 마커가 빠질 수 있으나, 누적 바이트는 직전 주기 샘플로 이미 전송돼 egress 집계에는 영향이 없다.

## 백엔드 명세 (BY-490)

`POST /api/rtc-stats`, 성공 `204 No Content`, 인증 없음, fire-and-forget.

필수 필드는 `connectionId`(최대 64자 문자열), `roomId`, `userId`, `candidateType`(`host`·`srflx`·`prflx`·`relay`), `isFinal`. 선택 필드는 `peerUserId`, `relayProtocol`(`udp`·`tcp`·`tls`), `bytesReceived`, `bytesSent`, `rttMs`, `at`. `candidateType`이나 `relayProtocol`이 허용값을 벗어나면 `400`.

## 설계 결정

### 승인받은 결정

- 전송은 세 시점(연결·60초·종료) 모두 `fetch(url, { keepalive: true })` 하나로 통일한다. 인증 헤더 부착과 웹뷰 호환이 `sendBeacon`보다 낫다.
- 보고는 WebRTC 연결 수명만 따른다. `pagehide` 같은 창 이탈 리스너는 두지 않는다(최종 결정, 아래 근거).
- 측정은 모든 빌드에서 상시 동작한다. 프로덕션 실사용 트래픽에서 릴레이 비율과 egress가 잡혀야 목적에 맞다.

이탈 리스너를 뺀 근거: iOS 웹뷰는 실제 종료가 아니어도 `pagehide`를 낸다(`systemPauseSource.ts`가 같은 이유로 `pageshow` 복귀 짝을 둔다). `pagehide`에서 종료 처리를 하면 살아남은 연결의 보고가 멈추거나, 복귀 시 같은 PeerConnection이 새 `connectionId`를 받아 "PeerConnection당 하나" 규칙이 깨진다. 짧은 백그라운드는 인터벌이 얼었다 살아나 같은 `connectionId`로 이어지고, 3초 이상 가림은 기존 `resetConnections`가 연결을 재구축하며 종료 보고와 새 연결을 만든다. 하드 강제종료에서만 마지막 `isFinal` 마커가 빠지지만, 그 연결의 누적 바이트는 직전 주기 샘플로 이미 전송돼 egress 집계에는 영향이 없다.

### 스스로 확정한 기술 결정

- `connectionId`는 `crypto.randomUUID()`로 PeerConnection을 만들 때 한 번 발급하고, 그 PC가 살아있는 동안 바꾸지 않는다. 연결이 재수립되면(`discardPeer` 후 재생성) 새 PC가 새 id를 받는다.
- 마지막 샘플은 직전 주기 샘플을 캐시해 두었다가 종료 시 `isFinal: true`로 보낸다. `getStats()`는 비동기라 종료 순간에 새로 읽어 기다릴 필요 없이 캐시를 그대로 쓴다. `bytesReceived`는 pair 누적값이라 60초 이내로 오래된 캐시도 총 egress에 충분히 가깝다.
- 종료 보고는 캐시를 지워 멱등하게 만든다. 종료 경로가 겹쳐도 두 번 나가지 않는다.
- 비동기 `getStats()`가 늦게 돌아오는 사이 PC가 폐기·교체되면 그 샘플을 버린다(await 뒤 `peers`와 `connectionId`를 재확인). 낡은 샘플이 새 id로 보고되는 것을 막는다.
- `candidateType`·`relayProtocol`은 허용값 화이트리스트로 거르고, `bytesReceived`·`bytesSent`·`rttMs`는 유한·0 이상일 때만 싣는다. 백엔드의 400을 fail-closed로 막는다.
- candidate 종류는 relay가 아니어도 전부 보고한다. 비율 계산에는 분모(비relay)도 필요하다.
- 보고 실패와 `getStats()` 부재·실패는 삼켜 통화 화면에 영향을 주지 않는다.
- 기존 `reportSelectedPath()`의 디버그 로그는 유지하고, 값 수집을 넓혀 재사용한다.

## 구조와 데이터 흐름

### 계층 분리

- `peerMesh.ts`는 순수 오케스트레이션을 유지한다. DOM `fetch`를 직접 부르지 않고, 주입받은 `reportStats(payload)` 콜백만 호출한다. 테스트는 가짜 콜백을 주입해 호출을 검증한다.
- `usePeerMesh.ts`(React 결합)가 실제 보고 함수 `reportRtcStats`를 주입한다. 창 이탈 리스너는 두지 않는다.
- `lib/rtcStatsApi.ts`(신규)가 `fetch(keepalive)` 한 방을 fire-and-forget으로 보낸다. `roomApi.ts`는 실패 시 `throw`하는 규칙이라, 던지지 않는 이 보고를 같은 파일에 섞지 않는다.

### PeerMesh 내부

- `createPeerMesh` 옵션에 `roomId: number`와 `reportStats?: (payload: RtcStatRequest) => void`를 더한다.
- 내부 상태 세 가지를 더한다: `connectionIds: Map<number, string>`, `statsTimers: Map<number, interval>`, `lastStatsSample: Map<number, 캐시된 페이로드>`.
- `collectStats(pc)`는 지금 `reportSelectedPath`가 하는 pair 탐색에 `relayProtocol`·`bytesReceived`·`bytesSent`·`rttMs`를 더해 뽑는다.
- `sampleAndReport(userId, pc)`는 `collectStats` 결과에 `connectionId`·`roomId`·`userId`(나)·`peerUserId`(상대)·`isFinal: false`·`at`을 붙여 `reportStats`로 보내고 캐시에 저장한다. await 뒤 PC·id를 재확인해 낡은 샘플을 버린다.
- `finalizeStats(userId)`는 타이머를 지우고, 캐시된 샘플이 있으면 `isFinal: true`로 즉시 보낸 뒤 캐시·id를 지운다. 없으면 아무것도 하지 않는다.

### 수명주기

- `oniceconnectionstatechange`가 `connected`가 되면 즉시 1회 보고한 뒤 60초 인터벌을 건다. `connectionId`는 PC 생성 시 이미 발급돼 있다.
- `closePeer(userId)`(MEMBER_LEFT·reset)는 `pc.close()` 전에 `finalizeStats(userId)`를 부른다.
- `close()`(언마운트)는 모든 연결에 `finalizeStats`를 부른다.
- `discardPeer(userId)`(글레어·재입장 재수립)도 `finalizeStats(userId)`로 종료 보고를 낸 뒤 폐기한다. 모든 종료 경로가 한 함수로 모인다.
- 창 이탈·복귀는 따로 처리하지 않는다(위 "이탈 리스너를 뺀 근거" 참고).

## 실패 처리와 개인정보

- 보고 요청 실패는 `.catch(() => undefined)`로 삼킨다.
- `getStats()`가 없거나 실패하면 그 회차 보고를 건너뛴다.
- candidate 종류·바이트·RTT 외에는 보내지 않는다. 원본 프레임이나 얼굴 데이터는 포함하지 않는다.

## 테스트 계획

`peerMesh.test.ts`의 기존 `getStats()` mock 위에 다음을 더한다.

- `connected` 시 `reportStats`가 `candidateType`과 `connectionId`를 담아 1회 불린다.
- relay 경로면 `relayProtocol`·`bytesReceived`가 실린다.
- `closePeer`·`discardPeer`·`close`가 `isFinal: true` 샘플을 한 번 보낸다.
- 잘못된 `candidateType`·`relayProtocol`과 음수·비유한 수치는 빠지거나 보고되지 않는다.
- 늦게 온 `getStats()` 결과가 폐기된 PC에 대해 보고되지 않는다.
- `getStats()`가 없거나 던지면 `reportStats`가 불리지 않는다.

`rtcStatsApi.ts`는 `fetch`를 mock해 `keepalive: true`와 요청 본문을 검증하는 작은 테스트를 둔다.

## 변경 파일

- `apps/web/src/features/live-room/peerMesh.ts` — 값 수집·검증 확장, 보고 수명주기(연결·주기·종료), race 가드.
- `apps/web/src/features/live-room/usePeerMesh.ts` — `roomId`·보고 함수 주입.
- `apps/web/src/features/live-room/LiveRoomSession.tsx` — `roomId`를 `usePeerMesh`로 전달.
- `apps/web/src/lib/rtcStatsApi.ts` — 신규 보고 함수.
- `packages/types/src/index.ts` — `RtcStatRequest` 타입.
- `apps/web/src/features/live-room/__tests__/peerMesh.test.ts` — 보고 테스트.

## YAGNI로 뺀 것

- 별도 측정 on/off 플래그. 상시 동작으로 확정했다.
- 샘플 배치·큐잉·재시도. fire-and-forget이라 유실은 감수하고 백엔드가 누적값으로 흡수한다.
- 신규 의존성. `fetch`·`crypto.randomUUID`·기존 패턴으로 충분하다.
