# SCR-004 Home

## Purpose

FocusOn 모바일 앱의 로그인 후 홈 화면이다. 사용자가 당일 00:00부터 현재까지의 공부 상태를 빠르게 확인하고, 싱글룸 또는 멀티룸으로 진입하는 역할을 한다.

이 화면은 사용자를 평가하거나 감시하는 인상을 주지 않는다. 총 공부 시간, 공부 유지 시간, 집중률을 차분하게 보여주고 사용자가 다시 집중을 시작하도록 돕는다.

## Source Of Truth

- Figma file: `FocusON`
- Figma file URL: <https://www.figma.com/design/awZQ0hSGuxwMHkLfZZhsjl/FocusON>
- Figma frame: `Screen/SCR-004/Home/Default`
- Figma node: `24:3`
- Figma page: `05_Screens`
- Figma section: `03_Home`
- Design system: `DESIGN.md`
- Ownership: `docs/screen-ownership.md`
- Mobile target: `apps/mobile`

Figma is the visual source of truth for this screen. Code implementation must read this frame through Figma MCP before implementation and map the result to the mobile app architecture instead of copying absolute Figma coordinates blindly.

## Ownership Boundary

Mobile owns this screen as part of the app shell.

This screen may navigate into the study-room entry flows, but it must not implement WebView study-room internals, camera processing, RTC, MediaPipe, or AI Vision state detection logic. Those areas are owned by `apps/web` and domain packages according to the project architecture.

## Current Figma Structure

```text
Screen/SCR-004/Home/Default
  Header
    Header/Greeting
      ServiceName
      GreetingText
    Header/TodayPill
      Date
  Section/TodayStudyStatus
    Title
    Card/StudySummary
  Actions/RoomEntry
    Button/SingleRoom
    Button/MultiRoom
  SafeArea/FlexibleBottomSpace
  SafeArea/HomeIndicator
```

Frame size is `393 x 852`, matching an iPhone 15-level mobile portrait frame. The screen uses a single-column layout with 20px horizontal page padding and safe-area-aware top and bottom spacing.

## Content

Header:

- `FocusOn`
- `오늘도 흐름을 이어가요`
- `7월 22일`

Section title:

- `오늘의 공부 상태`

Study summary example data:

- `총 공부 시간`: `3시간 20분`
- `공부 유지 시간`: `2시간 42분`
- `집중률`: `81%`
- Focus rate helper: `공부 유지 시간 ÷ 총 공부 시간 기준`

Room entry actions:

- Primary CTA: `싱글룸 입장`
- Primary helper: `혼자 집중을 시작해요`
- Secondary CTA: `멀티룸 입장`
- Secondary helper: `다른 사람들과 함께 집중해요`

## Data Contract

All displayed study metrics are based on records from the current day at 00:00 through the current time.

```ts
type HomeStudySummary = {
  totalStudySeconds: number;
  focusStudySeconds: number;
  focusRate: number;
};
```

`focusRate` is calculated as:

```text
focusStudySeconds / totalStudySeconds
```

Implementation must handle `totalStudySeconds === 0` before dividing. Empty, loading, and error states are not designed in the current Figma frame and must not be invented during the first implementation without a follow-up design pass.

## Interaction Contract

`싱글룸 입장`:

- Primary action.
- Starts the single-room study flow.
- Single-room copy must preserve the privacy distinction from `DESIGN.md`: camera analysis is local to the device and video is not sent or stored.

`멀티룸 입장`:

- Secondary action.
- Enters the all-day multi-room study flow with other participants.
- Multi-room copy must preserve the privacy distinction from `DESIGN.md`: video may be transmitted for participant display, but AI analysis source frames and face data are not sent to the server.

## Design Tokens Used

Colors:

- `brand/primary`
- `brand/primaryPressed`
- `brand/primarySoft`
- `brand/onPrimary`
- `background/canvas`
- `background/surface`
- `background/subtle`
- `text/primary`
- `text/secondary`
- `text/tertiary`
- `border/default`
- `status/studying`

Spacing and radius:

- `space/2`
- `space/3`
- `space/4`
- `space/5`
- `space/6`
- `space/8`
- `radius/medium`
- `radius/large`
- `radius/xlarge`
- `radius/full`

Text styles:

- `FocusOn/display`
- `FocusOn/title2`
- `FocusOn/title3`
- `FocusOn/body`
- `FocusOn/bodySmall`
- `FocusOn/label`
- `FocusOn/caption`

The Figma file was initially empty, so these variables and text styles were created locally from `DESIGN.md` rather than imported from an existing FocusOn library.

## Components

Existing reusable components before this work:

- None. The Figma file was empty.

New local Figma components:

- `Button/SingleRoom`
- `Button/MultiRoom`
- `Card/StudySummary`

The SCR-004 frame uses instances of these local components. Future screen work should reuse or intentionally evolve these components instead of duplicating primitive layers.

## Implementation Notes For AI Agents

Before coding this screen:

1. Read `DESIGN.md`, `docs/screen-ownership.md`, and this document.
2. Use Figma MCP `get_design_context` for frame node `24:3`.
3. Implement only within `apps/mobile`.
4. Reuse existing mobile app architecture and shared UI primitives if they exist.
5. Do not modify `apps/web`, study-room internals, camera analysis, or RTC code for this screen.
6. Do not add ranking, streaks, AI reports, study group search, login UI, or extra dashboard cards.
7. Do not invent bottom tab destinations. Reflect the current navigation structure only.

The implementation should favor semantic layout components such as `Screen`, `Stack`, `Row`, `Card`, `Button`, and `AppText` once they exist. If they do not exist yet, this screen can act as the first concrete input for extracting them, but extraction must remain scoped to the mobile presentation layer.

## Accessibility Requirements

- Buttons must have at least 44px touch target height. Current Figma button height is 60px.
- Focus rate must be conveyed by text and number, not by the progress bar alone.
- Text must preserve readable contrast against the canvas and card backgrounds.
- Korean labels must not be truncated on the target mobile width.
- System font scaling must keep the core metrics and both room-entry actions usable.

## Current Limitations

- Only the default state exists.
- Loading, empty, and error states are not yet designed.
- Date and metric values are example content.
- The current Figma font is Inter because it was available in Figma. Runtime mobile implementation should follow `DESIGN.md` and use platform system fonts unless the team decides otherwise.
- Bottom tab navigation was not designed because the project does not yet define final tab destinations.

## Review Checklist

- Confirm whether the canonical product term should remain `공부 유지 시간` on the home screen or be changed back to `순공시간`.
- Confirm final tab destinations before adding bottom navigation to this frame.
- Confirm whether `Button/SingleRoom`, `Button/MultiRoom`, and `Card/StudySummary` should be promoted into a broader component library after one or two more screens.
- Add loading, empty, and error variants in a separate Figma pass before implementation depends on those states.
