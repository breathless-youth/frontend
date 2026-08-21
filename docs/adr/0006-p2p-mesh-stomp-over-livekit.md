# 0006. 멀티룸 실시간 전송을 LiveKit 대신 WebRTC P2P 풀메시 + STOMP로 구현

- Status: Accepted
- Date: 2026-08-21
- Relates to: [ADR 0001](./0001-webview-based-study-room-architecture.md)(활성 아키텍처 — WebView), [ADR 0002](./0002-native-mobile-study-room-and-independent-web.md)(LiveKit을 전제한 구판 목표 아키텍처), `.ai` 레포 `product/specs/BY-404-실시간-룸.md`(원본 계약), `.ai` 레포 `decisions/0002-social-video-p2p.md`(P2P·서버 미저장 원칙)

## 배경

루트 `CLAUDE.md`의 아키텍처 경계와 ADR 0002는 멀티룸 화면 공유를 **LiveKit** 기반으로 서술해 왔다. 그러나 2026-08-19 11차 인터뷰에서 V1.3 실시간 룸의 전송 방식이 **WebRTC P2P 풀메시 + STOMP over WebSocket 제어 채널 + coturn(STUN/TURN 겸용 1대)** 으로 확정됐고, `.ai` 명세 `BY-404-실시간-룸.md`가 그 계약을 소유한다. 저장소 문서와 실제 설계가 어긋난 상태라 경계 서술을 갱신해야 한다.

## 결정

**V1.3 초대코드 룸(동시 최대 6명)의 실시간 전송은 LiveKit을 쓰지 않는다.**

- 미디어 평면: 브라우저 표준 `RTCPeerConnection` P2P 풀메시(1인당 최대 5연결), 240p/15fps/VP8/200kbps 상한. 외부 미디어 SDK 없음.
- 제어 평면: 기존 Spring Boot에 추가되는 STOMP over WebSocket — 입퇴장·정원 판정·카메라/집중 상태·순공시간·WebRTC 시그널링.
- NAT 통과: coturn 1대(AWS EC2)가 STUN+TURN 겸용, 시간제한 HMAC 자격.

근거(BY-404 명세 정책 결정 요약):

1. **정원 6명 캡이 P2P 전제로 성립한다** — 풀메시 부담(업/다운 ~1Mbps)이 모바일에서 감당 가능한 수준.
2. **서버 미저장 고지에 최선** — 영상이 서버(미디어 서버 포함)를 저장 경로로 거치지 않는다는 프라이버시 서사가 가장 단순해진다(TURN은 암호화 페이로드 경유만).
3. **비용·운영** — 미디어 서버 고정비 0, BE 1인 운영 부담 최소(기존 서버에 STOMP만 추가).
4. LiveKit(클라우드/자체 호스팅)은 SFU라 위 2·3에서 불리하고, 6명 소정원에서는 SFU의 확장성 이점이 발현되지 않는다.

## 결과

- 루트 `CLAUDE.md` 아키텍처 경계의 "WebRTC(LiveKit) 구현과 Vision AI 구현을 분리한다"는 **"WebRTC 구현과 Vision AI 구현을 분리한다"로 일반화**한다 — 분리 원칙 자체는 유지되고, 구현체 명칭만 계약에서 제거한다. `apps/web/CLAUDE.md` 등 다른 문서의 LiveKit 서술도 같은 방향으로 갱신한다.
- 공유 패키지의 "LiveKit 의존 금지"는 "미디어 SDK 의존 금지"로 그대로 유효하다.
- 제어 채널은 `RoomChannel` 인터페이스 뒤에 격리한다(BY-410) — V1.4+ 공개방·종일룸에서 SFU(LiveKit 포함) 재검토 시 미디어 전송 모듈만 교체할 수 있게 한다. ADR 0002의 LiveKit 서술은 이 재검토 시점의 후보로 남는다(폐기 아님).
- 선행 조건: iOS WKWebView에서 `getUserMedia` + `RTCPeerConnection` 동시 동작 스파이크(BY-404 명세) — 실패 시 네이티브(react-native-webrtc) 전환을 재논의한다. 이 ADR은 스파이크와 무관한 제어 평면(STOMP)부터 유효하다.

## 대안

- **LiveKit Cloud**: 구현 최속이지만 종량 과금과 "영상이 미디어 서버를 거친다"는 고지 부담. 기각.
- **LiveKit 자체 호스팅 / 일반 SFU**: 서버 비용·운영 부담이 1인 BE에 과함, 6명 정원에서 이점 없음. 기각.
- **P2P + 시그널링 SaaS**: 시그널링은 정원 판정·상태 동기화와 한 몸이라 기존 서버(STOMP)가 겸하는 편이 단순. 기각.
