# 실시간 룸 화면과 상태 동기화 설계 (BY-410)

- 날짜: 2026-08-21
- 원본 계약: `.ai` 레포 `product/specs/BY-404-실시간-룸.md`
- 관련: [ADR 0006](../../adr/0006-p2p-mesh-stomp-over-livekit.md), BY-409(선행, 완료), BY-408(BE 짝)
- 범위: STOMP 상태 동기화 + 자동 그리드 + 카메라 토글 + 나가기. **WebRTC 영상은 다음 티켓** —
  이번 단계의 상대 타일은 항상 아바타다.

## 확정 결정 (사용자 승인)

| 결정             | 내용                                                                                                                                                                                                             |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 룸 라우트        | `/social/room/:roomId` — 소셜 탭 웹뷰 안 웹 라우팅(네이티브 모달 아님). join 응답이 이미 웹에 있고 룸은 회전 스펙이 없다                                                                                         |
| 진입             | S9-2/3의 join 성공 → router state(`inviteCode`·`graceRejoin`·`cameraOn`)로만. state 없으면 소셜 홈 복귀                                                                                                          |
| 카메라 켜기 확인 | **웹 모달**(명세 개정 `445e3e3`) — 미리보기 + 고지 + [끄고 입장]/[카메라 켜기]. iOS 얼럿 룩 재현 안 함. ⚠️ 피그마 시안 확정 전이라 최소 스타일, 시안 확정 후 표현만 교체                                         |
| 30초 TTL         | 모달 확정 시점에 **join 재호출(재예약)** 후 즉시 STOMP 연결 — 모달 체류 시간이 TTL과 무관해짐. 같은 유저 재-join 멱등은 BY-408 확인 요청                                                                         |
| 채널             | `RoomChannel` 인터페이스 + `createMockRoomChannel`(시나리오 재생, `?mockRoom=N` dev 시연) + `createStompRoomChannel`(@stomp/stompjs ^7, 순수 WS, 재연결 시 재구독). WS URL은 API 베이스 파생 + vite `/ws` 프록시 |
| 메시지 반영      | 순수 리듀서 `roomMembersReducer` — SNAPSHOT 교체·JOINED 중복 교체·미지 userId 무시(순서 역전 방어). 내 타일 첫 번째는 `orderedMembers` 셀렉터                                                                    |
| 측정             | `useStudyRoomSession` 수정 0줄 재사용. 카메라 토글 = pause/resume(스트림 유지, track disable은 P2P 티켓). "세션 중 API 호출 금지·제출 1회" 계약 유지                                                             |
| 발행             | `useRoomStatePublisher` — PAUSE 진입/해제 → `CAMERA_CHANGED`, FOCUS/DISTRACTED 전이 → `FOCUS_CHANGED`, 60초 인터벌 → `STUDY_TIME`. 마운트 시 무발행(변화만 중계)                                                 |
| 그리드           | `roomGridSpec`: 1 풀스크린(크롬 없음) / 2 `1×2` / 3~~6 `2×3` 단위(3~~4명도 타일 높이 1/3, 세로 중앙)                                                                                                             |
| 타일             | 다크 고정 서피스, 순공 `HH:MM`, 목표 null이면 생략. 상태 테두리(글로우)는 2026-08-21 사용자 승인으로 전면 삭제 — 카메라 끔은 아바타 전환, 집중상태는 sr-only 텍스트만                                            |
| 나가기           | 종료 확인(`SessionConfirmDialog` 재사용) → `endAndSubmit` → 성공 시 `leaveRoom` **best-effort**(실패해도 진행 — 서버 30초 유예가 정리) → 소셜 홈 replace. 제출 실패는 룸에 남아 재시도                           |

## BE 확인 항목 (BY-408 코멘트 게시됨)

재-join 멱등 / SNAPSHOT 내 본인 포함 여부 / 발행 페이로드 userId 미포함 가정 / 재연결 시
SNAPSHOT 재전송 / 순수 WebSocket(SockJS 아님). FE는 어느 쪽이든 동작하게 방어했다
(내 타일 로컬 값 우선, 미지 userId 무시).

## 알려진 제약 (후속)

- 브라우저 back·iOS 엣지 스와이프·Android 하드웨어 back으로 룸을 이탈하면 종료 확인 없이
  세션이 버려진다(제출 없음, 자리는 서버 30초 유예가 정리). 라우터 차단(useBlocker)은
  데이터 라우터 전환이 필요하고 하드웨어 back은 네이티브 셸 소관이라 별도 티켓으로 다룬다.
- 입장 모달의 "영상 공유" 문구는 P2P 영상 티켓과 같은 릴리스로 배포한다는 전제다 —
  티켓·PR에 제약으로 명기한다.

## 검증

전 모듈 TDD(Red 확인 후 Green). 연결 수립·재연결·지연 등 실시간성 자체는 mock의 검증 대상이
아니며 BE STOMP 서버 오픈 후 실서버로 확인한다.
