# 컴포넌트 카탈로그 (Figma V1.4 `🧩 2. Components` 페이지 `14:3` ↔ 코드)

노드 id는 2026-09-08 `get_metadata`로 확인한 값이다. 인스턴스 이름이 아래에 없으면 새 컴포넌트가 맞는지 먼저 의심하고, 있으면 그 코드를 재사용한다.

## 공통

| Figma | 노드 | 코드 |
|---|---|---|
| Button / CTA V2 (Kind=Primary·Neutral·Destructive·Subtle, Size=56·48·44·38·36·32) | `2403:111` | `components/ui/button.tsx` (`Button`, `buttonVariants`). 없는 Kind·Size는 variant·size를 추가한다 |
| Button / CTA (구 4종) | `40:94` | 같은 `Button`. 새 화면은 V2 기준 |
| Dialog / Confirm V2 (Buttons=One·Two·Two Destructive) | `2405:126` | `components/ui/dialog.tsx` |
| Sheet / Bottom | `44:96` | 없음 → `components/ui/drawer.tsx`(vaul) 예정 |
| Sheet / Menu Item | `2405:138` | 없음 |
| Control / Toggle | `43:89` | 설정 화면 로컬 |
| Settings / Row (5종) | `43:117` | `features/settings` |
| Input / Text, Search / Field | `2403:118` `2403:136` | `features/social-room` 로컬 |
| Input / PIN Box | `2403:123` | `components/ui/input-otp.tsx`(input-otp) + `features/social-room/InviteCodeInput.tsx` (BY-716) |
| Chip / Filter | `2402:114` | `features/social-room` |
| Avatar | `2402:109` | `features/social-room` |
| Navigation / Tab Bar (Active=Home·Social·Record·Settings) | `36:101` | 네이티브 셸이 그린다(`apps/mobile`). 웹에는 없다 |
| iOS / Status Bar, Home Indicator | `48:131` `36:25` | 웹에는 없다. `env(safe-area-inset-*)`만 |
| 아이콘 19종 + 소셜 아이콘 | `32:2`, `2400:95`~`2400:146` | 각 feature의 `icons.tsx`. 새 아이콘은 Figma에서 SVG로 내보내 `currentColor`로 바꾼다 |

## 홈

| Figma | 노드 | 코드 |
|---|---|---|
| V2 `streak-card` (S1 홈 Soft Blue `5381:3773`) | `5381:3773` | `routes/HomeTabPage.tsx` `StreakCard` = `Card` + `features/records/StreakBanner` `WeekDot` + `Tooltip` |
| V2 `stats-card` (`5381:3812`, 순공·집중률 게이지·총 공부·최대 집중) | `5381:3812` | `StatsCard` = `Card` + `components/ui/progress.tsx` |
| V2 `cta · 집중 시작` (`5381:3834`) | `5381:3834` | `components/ui/button.tsx` `size=xl` |
| V2 `invite-card` (`5381:3836`, 친구 초대 → 소셜 탭) | `5381:3836` | `InviteCard`(`<button>`) + `assets/home-invite-friends.png` |
| Card / Hero Today · Start CTA · Stat · Guide (V1.4 `39:80` `38:66` `38:86` `39:108`) | | V2 홈으로 대체됨. 코드 없음 |

## 기록

| Figma | 노드 | 코드 |
|---|---|---|
| Record / Week Dot (Done·Today) | `46:101` | `features/records/StreakBanner.tsx` `WeekDot` (도장 스트립으로 교체 예정) |
| Record / Calendar Cell (Default·Dotted·Selected·Today·Muted) | `46:122` | `features/records/MonthCalendar.tsx` `CalendarCell` |
| Record / Summary Tile (Accent=True·False) | `46:131` | `features/records/SummaryTiles.tsx` |
| Record / Session Item | `46:149` | `features/records/SessionListItem.tsx` |
| Chip / Event Tag | `46:93` | `features/records/EventChip.tsx` |

## 세션·결과

| Figma | 노드 | 코드 |
|---|---|---|
| Session / Status Pill (Focus·Distract·Paused) | `34:14` | `features/study-session/components/SessionStatusPill.tsx` |
| Session / Control Bar | `34:32` | `SessionControlBar.tsx` |
| 결과 카드·타임라인 막대·상태 도트 | (S4 프레임 로컬) | `ResultCardParts.tsx` (`ResultCard`, `ResultStatusDot`, `ResultBarSegment`) |

## 소셜

| Figma | 노드 | 코드 |
|---|---|---|
| Room / Tile (집중·비집중·일시정지) | `2406:1968` | `features/live-room/components/RoomTile.tsx` |
| Room / Self Badge | `2645:183` | `live-room` 로컬 |
| Member / Row (공부중·휴식) | `2406:126` | `features/social-room` |
| Card / Group (내 그룹·탐색) | `2406:173` | `features/social-room` |

## 온보딩

| Figma | 노드 | 코드 |
|---|---|---|
| Coach / Tooltip, Pager Dots, Button / Ghost Dark SM | `47:101` `47:137` `47:140` | `features/onboarding` |

## 재조립 임시 섹션 (S10-draft `3035:7328`, 2026-09-08, 승인 전)

BY-557·564 시안 재조립에서 새로 만든 컴포넌트다. 승인되면 `🧩 2. Components` 페이지로 옮기고 이 표를 위 표에 합친다.

| Figma | 노드 | 코드 (예정) |
|---|---|---|
| Record / Stamp Cell (State=Done·New·Today·None·Future, Label 텍스트 속성) | `3036:7364` | `components/StreakStamps.tsx` (BY-560·홈 개선) |
| Record / Calendar Cell V2 (State=Default·Today·Selected·Muted × Intensity=None·Low·Mid·High, Day 텍스트 속성) | `3036:7430` | `features/records/MonthCalendar.tsx` `CalendarCell` (BY-567) |
| Control / Segmented (Selected=Weekly·Monthly) | `3036:7375` | `features/records/RecordsTabs.tsx` (BY-566) |
| Record / Period Header (Range·Title·Total·Delta 텍스트 속성) | `3036:7376` | `features/records/PeriodHeader.tsx` (BY-566) |
| Record / Session Row V2 (Range·Focus 텍스트 속성) | `3037:7414` | `features/records/SessionListItem.tsx` (BY-566·568) |
| Result / Timeline | `3036:7431` | `StudyTimelineBody` (BY-568·560) |
| icon/paw, illust/paw-seal | `3035:7335`, `3035:7339` | `src/assets/result/paw-seal.svg` (BY-560) |

## 카탈로그 갱신

새 컴포넌트를 Figma에 만들거나 코드에 추가하면 이 표에 한 줄을 더한다. 노드 id는 추측하지 말고
`get_metadata`로 다시 확인한다.
