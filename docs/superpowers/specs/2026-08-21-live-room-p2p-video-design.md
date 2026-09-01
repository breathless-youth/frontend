# 실시간 룸 WebRTC P2P 영상 설계 (BY-413)

- 날짜: 2026-08-21
- 원본 명세: `.ai` 레포 `product/specs/BY-404-실시간-룸.md`
- 관련: [ADR 0006](../../adr/0006-p2p-mesh-stomp-over-livekit.md), BY-410(선행, 완료), BY-408(BE 짝)
- 범위: P2P 풀메시 영상 송수신. 시그널링은 기존 STOMP 채널 확장. 오디오·녹화·simulcast 없음.
- 구조 도식: 사용자 승인 아티팩트(A안 채택, 유예 재입장 1안 채택 — 2026-08-21)
- BE 실 구현 대조: backend dev `978fb5c`(BY-408 머지)로 아래 결정·정합화 절을 확정했다 — 2026-08-21

## 확정 결정 (사용자 승인)

| 결정            | 내용                                                                                                                                                                                                                                                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 구조            | A안 — `RoomChannel`에 `publishSignal`만 추가하고, 연결 수립·영상 관리는 신규 모듈 `peerMesh`가 전담한다. `RTCPeerConnection` 생성은 팩토리 주입으로 격리해 테스트에서 가짜로 대체한다                                                                                                                                       |
| glare 방지      | `SNAPSHOT` 수신자(신규 입장자)만 기존 멤버 전원에게 offer를 만들고, `MEMBER_JOINED` 수신자(기존 멤버)는 answer만 한다. 동시 offer 충돌이 구조적으로 없다                                                                                                                                                                    |
| 시그널          | `SIGNAL`의 `OFFER`/`ANSWER`/`CANDIDATE`를 `/app/room/{roomId}/signal`로 발행한다. `payload`는 JSON 객체 그대로(`RTCSessionDescriptionInit`/`RTCIceCandidateInit`) 릴레이된다. 수신형에는 서버가 `fromUserId`를 실어 주며 발신 세션·수신자 멤버십도 서버가 검증한다(BE 확인 완료). 수신 런타임 가드에 SIGNAL 검증을 추가한다 |
| 송출 품질       | 카메라 스트림(추론용 1280)은 그대로 두고 송출측 `RTCRtpSender.setParameters`에서만 `scaleResolutionDownBy`로 240p, `maxFramerate` 15, `maxBitrate` 200000을 건다. VP8은 `setCodecPreferences`로 우선 지정한다                                                                                                               |
| iceServers 전달 | join 응답 값을 router state로 룸까지 전달하고, 입장 확정 시의 재-join 응답으로 갱신한다. 유예 재입장은 이전 값을 재사용한다(1안). 만료 시 중계가 필요한 상대만 연결 실패로 아바타 표시된다                                                                                                                                  |
| 카메라 토글     | 끄기는 트랙 disable과 측정 일시정지이고 P2P 연결은 유지한다. 켜기는 enable과 재개다. 재협상 없음                                                                                                                                                                                                                            |
| 전면/후면 전환  | 어댑터 `flip()`이 새 스트림을 만들면 메시가 `replaceTrack`으로 이어받는다. 재협상 없음                                                                                                                                                                                                                                      |
| 실패 처리       | `failed`면 ICE restart를 1회 시도하고, 그래도 실패면 해당 상대의 수신 스트림만 제거해 아바타로 표시한다. 에러 UI 없이 백그라운드 재시도한다. 상태·순공시간은 STOMP 값으로 계속 갱신된다                                                                                                                                     |
| 퇴장 정리       | `MEMBER_LEFT` 수신과 세션 종료·언마운트 시 해당 연결을 닫는다                                                                                                                                                                                                                                                               |
| 수신 표시       | 상대 타일은 수신 스트림 도착 시 영상(`amp-block` 클래스 필수), 미도착·실패·카메라 끔이면 아바타다                                                                                                                                                                                                                           |
| 스파이크        | `/dev/webrtc-loopback` DEV 전용 루프백 페이지로 `getUserMedia`와 `RTCPeerConnection` 공존·240p 인코딩을 확인한다. 저장소에 유지한다. 기기 2대·TURN 검증은 BE 오픈 후다                                                                                                                                                      |

## BE 실 구현 확인 결과 (2026-08-21, backend dev `978fb5c`)

기존 확인 5건과 시그널 발신자까지 6건 전부 코드로 확인돼 종결됐다.

- 재-join: 미확정 예약 재호출은 예약 시각만 갱신, 유예 중이면 같은 자리 복원. 확정 후 재호출도 무해하다.
- SNAPSHOT: `/user/queue/room`으로 본인 포함 전송. 재구독마다 재전송되고 `MEMBER_JOINED`도 재브로드캐스트된다(FE 리듀서가 교체로 흡수).
- 발행 식별: 서버가 WebSocket 연결의 principal로 식별한다. 페이로드에 `userId`가 없다.
- 전송: 순수 WebSocket이다(SockJS 제거).
- SIGNAL: 서버가 `fromUserId`를 실어 대상 개인 큐로 릴레이하고, 발신 세션과 수신자 멤버십을 검증한다. FE는 `fromUserId` 없는 SIGNAL을 무시하도록 방어한다.

## 선행 정합화 (BY-410 머지본과 BE 실 스펙의 차이 — 이 티켓의 첫 단계)

- 멤버 필드: BE `RoomMember`는 `userId`·`cameraOn`·`focusState` 3개만 싣는다. FE 수신 가드가
  `nickname`·`studySeconds`를 필수로 요구해 실서버 SNAPSHOT·MEMBER_JOINED를 전부 폐기하므로,
  가드 필수 필드를 BE 실 스펙 3개로 완화하고 나머지는 없으면 표시 폴백한다.
- 멤버 프로필: `nickname`·`goal`·`studySeconds`를 SNAPSHOT·MEMBER_JOINED에 실어 달라고
  BY-408에 요청했다(2026-08-21 게시, 사용자 결정). BE 반영 전에는 해당 필드가 비어 아바타
  이니셜·목표가 생략 표시되고, 순공시간은 첫 `STUDY_TIME` 수신까지 비어 보인다.
- 상태 발행: BE `/app/room/{roomId}/state`는 type 없는 단일 `{cameraOn?, focusState?, studySeconds?}`를
  받아 서버가 `CAMERA_CHANGED` 등으로 변환·브로드캐스트한다. FE의 type 포함 발행은 서버가 모르는
  필드를 무시해 동작하지만, 발행 타입 정의를 실 스펙으로 정리한다.

## 알려진 제약 (후속)

- TURN 릴레이 폴백·기기 2대 송수신 검증은 coturn 배포 후에만 가능하다.
- BY-408 멤버 필드 추가 요청의 BE 반영 전에는 타일의 닉네임·목표·초기 순공시간이 비어 보인다.
- BY-410 입장 모달의 영상 공유 문구는 이 티켓과 같은 릴리스로 배포한다.

## 검증

전 모듈 TDD. 메시의 offer/answer 순서, glare 규칙, 퇴장 정리, `replaceTrack`과 `setParameters`
호출은 가짜 PC 팩토리로 검증한다. 실제 연결 수립·시그널 릴레이는 backend dev를 로컬로 띄워
실 STOMP로 통합 검증하고, 화질·TURN 폴백·기기 2대는 배포 후 실기기로 확인한다.
