# shadcn 매핑표 (Figma 컴포넌트 ↔ shadcn 프리미티브 ↔ 코드)

원칙: 화면을 만들 때 먼저 이 표에서 프리미티브를 고르고, 없을 때만 직접 만든다. 추가는
`pnpm --filter web dlx shadcn@latest add <name>`(`apps/web/components.json` 기준)으로 받은 뒤
토큰 클래스로 고친다. 받은 파일을 그대로 두지 않는다.

## 매핑

| Figma 컴포넌트 | shadcn | 저장소 파일 | 커스텀 포인트 |
|---|---|---|---|
| Button / CTA V2 (Kind=Primary·Neutral·Destructive·Subtle, Size=56·48·44·38·36·32) | Button | `components/ui/button.tsx` (있음, `size="xl"`·`variant="subtle"` 추가됨 — BY-716) | `cva`에 Kind → `variant`, Size → `size`를 1:1로 추가. 높이는 `h-14`(xl)·`h-12`·`h-11` 등 시스템 값, 반경 `rounded-lg`/`rounded-xl`(xl), 비활성 `text-text-disabled` |
| Dialog / Confirm V2 (Buttons=One·Two·Two Destructive) | Dialog | `components/ui/dialog.tsx` (있음) | 버튼 배치만 조합, 새 variant 만들지 않음 |
| Sheet / Bottom, 세션 상세 시트 | Drawer (vaul) | `components/ui/drawer.tsx` (추가 예정, BY-568) | 상단 반경 `rounded-t-xl`(20), 핸들 `aria-hidden`, `pb-[env(safe-area-inset-bottom)]`, 배경 `bg-background`, 그림자는 `shadow/sheet-up` 값 |
| Control / Segmented (주간/월간) | Tabs | `components/ui/tabs.tsx` (추가 예정, BY-566) | `TabsList`를 `rounded-full bg-bg-layer-2 p-[3px]`, `TabsTrigger`를 `h-11 rounded-full data-[state=active]:bg-background data-[state=active]:text-foreground text-text-tertiary`로. `TabsContent`는 쓰지 않고 상태만 쓴다 |
| 휴식 카드 "자세히" 펼침 | Collapsible | `components/ui/collapsible.tsx` (추가 예정, BY-560) | 트리거는 `<button>` h-11 이상, 셰브런 `data-[state=open]:rotate-180 motion-reduce:transition-none` |
| 홈 집중률 게이지 | Progress | `components/ui/progress.tsx` (있음) | 높이 10, 트랙 `bg-bg-layer-2`, 인디케이터 `from-primary/50 to-primary` 그라디언트, `motion-reduce:transition-none`, 호출부가 `aria-label` |
| Card / Hero Today·Stat·Guide, Result 카드, 기록 카드 | Card | `components/ui/card.tsx` (추가 예정) | `rounded-lg border border-border bg-muted`. 기존 `ResultCard`(study-session)와 `STAT_CARD_CLASS`(홈)를 이걸로 흡수 |
| Chip / Event Tag, 집중률 필 | Badge | `components/ui/badge.tsx` (추가 예정) | variant `brand`(`bg-brand-subtle text-primary`), `distract`(`bg-state-distract-subtle text-state-distract-text`), `pause`(`bg-bg-layer-2 text-text-tertiary`) |
| Record / Summary Tile | Card + 텍스트 | 위 Card 재사용 | Accent 변형은 값 색만 `text-primary` |
| Record / Session Row V2 | 직접(`<button>`) | `features/records/SessionListItem.tsx` | shadcn에 리스트 행 프리미티브가 없다. 44px, `aria-label` 필수 |
| Record / Calendar Cell V2, 월간 달력 | 직접 | `features/records/MonthCalendar.tsx` | `react-day-picker`는 보류. 농도 3단계와 월 이동 스와이프가 전부 커스텀이라 기존 달력을 고친다 |
| 주간 막대 | 직접(div) | `features/records/WeeklyBarChart.tsx` | `recharts` 보류. 막대는 `<button>` h-11 이상, `aria-pressed` |
| Input / Text, Search / Field | Input | `components/ui/input.tsx` (추가 예정, 필요 시) | 높이 52, `rounded-md`, 포커스 링 `ring-primary` |
| Invite Code / OTP | input-otp | `components/ui/input-otp.tsx` (있음, BY-716) | `InputOTP`·`InputOTPSlot`. 셀 룩은 `features/social-room/codeCell.ts`의 `CODE_CELL_CLASS`(방 생성 완료 화면과 공유), 활성 칸은 `border-2 border-primary` + `animate-caret-blink` |
| Settings / Row Type=Toggle, Control / Toggle | Switch | `components/ui/switch.tsx` (추가 예정, 필요 시) | 트랙 `data-[state=checked]:bg-primary` |
| Avatar | Avatar | `components/ui/avatar.tsx` (추가 예정, 필요 시) | 크기 34·40·48·72 |
| 토스트 | 기존 `components/ui/toast.tsx` 유지 | | `sonner` 보류. `ToastViewport`가 하단 위치를 소유한다 |
| Navigation / Tab Bar, iOS Status Bar | 없음 | 네이티브 셸 | 웹에서 그리지 않는다 |

## 커스텀 규칙

- 색·반경·간격은 토큰 클래스만 쓴다. shadcn 기본 클래스(`bg-secondary`, `ring-ring`, `rounded-md` 등)는 받은 직후 `tokens.md` 표로 바꾼다.
- `dark:` 변형을 쓰지 않는다. 토큰이 모드에 따라 바뀐다.
- variant는 Figma 속성 이름을 그대로 쓴다(Kind, Size). 코드에서만 존재하는 variant를 만들지 않는다.
- 터치 타겟은 44px 이상. shadcn 기본 `h-9`·`h-10` 버튼과 트리거는 그대로 쓰지 않는다.
- 새 프리미티브를 받으면 이 표에 한 줄을 더하고, 같은 PR에서 기존 로컬 구현(예: `ResultCard`)을 흡수한다.
