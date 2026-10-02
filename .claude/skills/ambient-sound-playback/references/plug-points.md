# 연결 지점 (2026-09-20 실측, `frontend/` 기준)

행 번호는 작업 시점에 어긋날 수 있다. 심볼명으로 다시 찾는다.

## 세션 상태 (싱글룸)
| 지점 | 파일 | 심볼/행 |
|---|---|---|
| 일시정지 | `apps/web/src/features/study-session/useStudyRoomSession.ts` | `const pause = useCallback(` :416 — `trigger: PauseTrigger("MANUAL" | "BACKGROUND")` |
| 재개 | 같은 파일 | `const resume = useCallback(` :431 |
| 종료·제출 | 같은 파일 | `const endAndSubmit = useCallback(` :496 |
| 백그라운드 → 일시정지 배선 | 같은 파일 | :455-471 |
| 백그라운드 감지 | `apps/web/src/features/study-session/adapters/systemPauseSource.ts` | `visibilitychange` :58 + `pagehide` :59. iOS WKWebView는 pagehide만 올 수 있다 |
| 상태 타입 | `apps/web/src/features/study-session/sessionState.ts` | `PauseTrigger` :19, `SessionEndReason` :38 |
| 화면 | `apps/web/src/routes/RoomPage.tsx` | 약 600행. 심플 모드 오버레이 토글 약 :480 |
| 컨트롤 바 | `apps/web/src/features/study-session/components/SessionControlBar.tsx` | 버튼 3개, 244×80 고정 필. 버튼 추가 시 폭 변경 → Figma 시안 선행 |

## 소셜룸
| 지점 | 파일 |
|---|---|
| 세션 | `apps/web/src/features/live-room/LiveRoomSession.tsx` |
| 컨트롤 바 | `apps/web/src/features/live-room/components/RoomControlBar.tsx` (탭으로 숨김 `hidden` 지원) |
| 가시성 | `apps/web/src/features/live-room/usePeerMesh.ts` :96, `useBackgroundGraceWatch.ts` |
| 오디오 없음 근거 | `features/study-session/vision/visionConfig.ts` :51,:55 `audio: false`; `features/live-room/peerMesh.ts` `addTransceiver("video")` :309 |

## 브리지
| 항목 | 파일 |
|---|---|
| 메시지 타입 | `packages/types/src/bridge.ts` — `app-state` :13, `track-event` :321 |
| 웹 쪽 | `apps/web/src/lib/bridge.ts` — `postToNative()`, `subscribeToNativeMessages()`. 브리지 없으면 no-op |
| 네이티브 쪽 | `apps/mobile/lib/webBridge.ts`, `apps/mobile/components/RemoteWebViewHost.tsx` `onMessage` :611 |
| WebView 프롭 | `RemoteWebViewHost.tsx` :575 `allowsInlineMediaPlayback`, :576 `mediaPlaybackRequiresUserAction={false}`. 여기에 `ignoreSilentHardwareSwitch` 추가 |
| 네이티브 설정 | `apps/mobile/app.json` — 오디오 백그라운드 모드 없음(추가하지 않는다) |

## 저장·UI·테스트 관례
| 항목 | 파일 |
|---|---|
| 복사할 저장 패턴 | `apps/web/src/features/onboarding/onboardingGuideStore.ts` — 인터페이스 :26, localStorage 구현 :37, 메모리 구현 :50, 교체 :64, 리셋 :69 |
| localStorage 이유 | `apps/web/src/features/social-room/socialRoomNotice.ts` :7 주석 |
| 모달 프리미티브 | `apps/web/src/components/ui/dialog.tsx` (바텀시트 컴포넌트는 없음) |
| 테스트 설정 | `apps/web/src/test/setup.ts` :7 `HTMLMediaElement.prototype.play` 스텁 |
| 테스트 위치 예 | `apps/web/src/features/study-session/__tests__/sessionControlBarEffects.test.tsx`, `apps/web/src/routes/__tests__/RoomPage.test.tsx` |
| 정적 자산 | `apps/web/public/` (Vercel 원격 서빙, CDN 없음). `sounds/` 폴더 신설 |
| 개정할 정책 문구 | `docs/screens/SCR-S3-7-S3-8-session-exit.md` :306 "세션 중 알림·소리·진동 미사용이 확정 정책" |
