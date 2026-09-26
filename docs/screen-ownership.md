# 화면 소유권 (Screen Ownership)

카메라 권한 거부 안내(`apps/mobile/app/permission-denied.tsx`)를 뺀 모든 화면은 `apps/web`이 구현하고 모바일은 원격 URL로 연다. 모바일이 직접 그리는 것은 셸뿐이다.

- 모바일의 탭과 세션 화면은 `RemoteScreen`에 웹 경로만 넘긴다(`apps/mobile/components/RemoteScreen.tsx`).
- 화면 ID는 `ai-wiki/product/design.md`의 확정 ID(Figma 프레임명)를 따른다.
- 웹 경로는 `apps/web/src/App.tsx`의 라우트 표 기준이다.
- 화면별 상세 스펙은 `docs/screens/SCR-{화면 ID}-*.md`에 있다.
- 구조 전체는 [architecture.md](./architecture.md)에 있다.

## `apps/mobile` 소유 화면 (앱 셸)

| ID   | 화면                            | 구현                                                                                               |
| ---- | ------------------------------- | -------------------------------------------------------------------------------------------------- |
| -    | 탭바                            | `app/(tabs)/_layout.tsx`, `components/TabBar.tsx`                                                  |
| S2-2 | 카메라 권한 요청(OS 다이얼로그) | 커스텀 UI 없이 `app.json`의 권한 문구와 `lib/cameraPermission.ts`의 요청만 둔다                    |
| S2-3 | 카메라 권한 거부 안내           | `app/permission-denied.tsx`(탭 밖 전체 화면)                                                       |
| -    | 스플래시                        | `expo-splash-screen`(`app/_layout.tsx`)과 로드 중 스켈레톤(`components/RemoteSplashSkeletons.tsx`) |

## `apps/web` 소유 화면

| ID        | 화면                        | 구현                                 | 경로                          |
| --------- | --------------------------- | ------------------------------------ | ----------------------------- |
| S1        | 홈                          | `src/routes/HomeTabPage.tsx`         | `/home`                       |
| S5        | 공부 기록                   | `src/routes/RecordsPage.tsx`         | `/records`                    |
| S6        | 설정                        | `src/routes/SettingsPage.tsx`        | `/settings`                   |
| G1~G5     | 온보딩 가이드(5단계)        | `src/routes/OnboardingGuidePage.tsx` | `/onboarding-guide`           |
| S3-1~S3-8 | 싱글 세션(프리뷰~자동 종료) | `src/routes/RoomPage.tsx`            | `/room/:id`                   |
| S4        | 공부 결과                   | `src/routes/ResultPage.tsx`          | `/room/:id/result`            |
| S9-1      | 소셜 홈                     | `src/routes/SocialHomePage.tsx`      | `/social`                     |
| S9-2      | 초대코드 공유               | `src/routes/InviteCodeSharePage.tsx` | `/social/code`                |
| S9-3      | 초대코드 입력               | `src/routes/InviteCodeJoinPage.tsx`  | `/social/join`                |
| S9-4~7    | 소셜 룸(자동 그리드)        | `src/routes/LiveRoomPage.tsx`        | `/social/room/:roomId`        |
| -         | 소셜 룸 결과                | `src/routes/ResultPage.tsx`          | `/social/room/:roomId/result` |
| S7-18     | 프로필 설정                 | `src/routes/ProfilePage.tsx`         | `/profile`                    |

- S3-1~S3-8은 한 화면 트리가 세션 상태와 표시 모드, 가로 브레이크포인트에 따라 바뀌어 그린다.
- 문의(`/contact`), 이용약관(`/terms`), 개인정보처리방침(`/privacy`), 오픈소스 라이선스(`/licenses`)도 웹 화면이다.
- `/`의 `HomePage`는 브라우저로 접속했을 때의 소개 페이지이고 앱에서는 열지 않는다.
- `/dev/webrtc-loopback`은 개발 빌드에만 있는 WebRTC 점검 화면이다.
