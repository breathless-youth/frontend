# SCR-016 All Day Room

> ⚠️ **V1.2+ 보류** (2026-07-24): 멀티룸(소셜)은 `.ai/product/roadmap.md` 기준 V1.2~V1.4 범위다. V1.0 작업에서 이 문서를 참조·구현하지 않는다.

## Purpose

FocusOn 모바일 앱의 멀티 종일룸 화면이다. 여러 사용자가 각자의 카메라 화면을 공유하며 함께 공부하는 실시간 캠스터디 공간을 제공한다.

이 화면은 사용자를 감시하거나 평가하는 관제 화면이 아니다. 참여자들의 공부 흐름과 세션 상태를 가볍게 공유하고, 장시간 공부 중에도 핵심 컨트롤을 빠르게 찾을 수 있게 돕는다.

## Source Of Truth

- Figma file: `FocusON`
- Figma file URL: <https://www.figma.com/design/awZQ0hSGuxwMHkLfZZhsjl/FocusON>
- Figma section: `06_SocialRoom`
- Figma section node: `35:27`
- Figma frame: `Screen/SCR-016/AllDayRoom/ControlsHidden`
- Hidden frame node: `35:28`
- Figma frame: `Screen/SCR-016/AllDayRoom/ControlsVisible`
- Visible frame node: `35:105`
- Figma component set: `ParticipantTile`
- Component set node: `34:98`
- Figma page: `05_Screens`
- Design system: `DESIGN.md`
- Ownership: `docs/screen-ownership.md`
- Mobile target: `apps/mobile`

Figma is the visual source of truth for this screen. Code implementation must read the target frame through Figma MCP before implementation and adapt the result to React Native, LiveKit, and the mobile app architecture.

## Ownership Boundary

Mobile owns this screen as a native React Native room screen.

This screen may render camera preview, LiveKit video tiles, room controls, and mobile session UI. It must not implement or modify unrelated WebView study-room internals, browser MediaPipe logic, server-side recording, study-core calculation rules, or web-owned room surfaces.

Vision AI analysis is performed on each user's device. Participant video is transmitted for live room display, but this screen must not imply recording or permanent storage.

## Current Figma Structure

```text
Screen/SCR-016/AllDayRoom/ControlsHidden
  ParticipantGrid/TwoColumns
    GridRow/1
      ParticipantTile/Self
      ParticipantTile/Studying
    GridRow/2
      ParticipantTile/Away
      ParticipantTile/CameraOff
    GridRow/3
      ParticipantTile/Paused
      ParticipantTile/Connecting

Screen/SCR-016/AllDayRoom/ControlsVisible
  ParticipantGrid/TwoColumns
    GridRow/1
      ParticipantTile/Self
      ParticipantTile/Studying
    GridRow/2
      ParticipantTile/Away
      ParticipantTile/CameraOff
    GridRow/3
      ParticipantTile/Paused
      ParticipantTile/Connecting
  Overlay/TopControls
    SessionTime
      PureStudyTime
      TotalStudyTime
    Action/WhiteNoise
    Action/Report
    Action/ShootingGuide
  Overlay/BottomControls
    Action/SwitchCamera
    Action/ToggleCamera
    Action/ExitRoom
    Control/GridColumns
      Option/1열
      Option/2열/Selected
```

Frame size is `393 x 852`, matching an iPhone 15-level mobile portrait frame. The participant grid is edge-to-edge, scrollable, and currently shown in the default 2-column mode.

## Content

Session time:

- `순공 02:42:18`
- `전체 03:20:00`

Top controls:

- `빗소리`
- `신고`
- `가이드`

Bottom controls:

- `전환`
- `카메라`
- `나가기`
- Grid toggle: `1열`, `2열`

Participant examples:

- `나`: `공부 중`, `02:42:18`, `2027 수능`
- `민서`: `공부 중`, `02:42:18`, `2027 수능`
- `지훈`: `자리 비움`, `01:10:44`, `공무원 9급`
- `서연`: `카메라 꺼짐`, `02:01:39`, `긴 공부 목표는 한 줄로 말줄임`
- `도윤`: `일시정지`, `00:58:03`, `정보처리기사`
- `유진`: `연결 중`, `00:00:00`, `토익 900점`

## Data Contract

The implementation should treat room participants as live, transient session data.

```ts
type AllDayRoomParticipantStatus =
  "STUDYING" | "AWAY" | "PAUSED" | "CAMERA_OFF" | "CONNECTING" | "RECONNECTING";

type AllDayRoomParticipant = {
  id: string;
  nickname: string;
  studyGoal: string;
  pureStudySeconds: number;
  status: AllDayRoomParticipantStatus;
  isSelf: boolean;
  cameraEnabled: boolean;
  videoTrackState: "live" | "connecting" | "reconnecting" | "off";
};

type AllDayRoomSession = {
  pureStudySeconds: number;
  totalStudySeconds: number;
  selectedWhiteNoise?: "rain" | "library" | "cafe" | "asmr";
  cameraFacing: "front" | "back";
  cameraEnabled: boolean;
  gridColumns: 1 | 2;
  controlsVisible: boolean;
  participants: AllDayRoomParticipant[];
};
```

`pureStudySeconds` and `totalStudySeconds` should use the same duration formatting rule as the rest of the mobile app. The Figma examples use `HH:mm:ss`.

## Interaction Contract

Controls visibility:

- Default room interaction can hide top and bottom controls.
- Tapping the video/grid area reveals controls.
- Scrolling the participant grid hides controls immediately.
- Tapping an empty area while controls are visible can hide controls.
- Automatic hide after inactivity should be implemented in app code.

Top controls:

- `SessionTime` shows pure study time first and total study time second.
- `Action/WhiteNoise` opens or toggles the white-noise selection flow without leaving the room.
- `Action/Report` enters a report-target selection flow if no participant is selected.
- `Action/ShootingGuide` opens shooting guidance without ending the session.

Bottom controls:

- `Action/SwitchCamera` is enabled only when the camera is on.
- `Action/ToggleCamera` toggles camera on/off without implying session exit.
- `Action/ExitRoom` should open an exit confirmation before ending the room session.
- `Control/GridColumns` toggles between 1-column and 2-column layouts. The current Figma frame shows `2열` selected.

## Design Tokens Used

Existing tokens reused:

- `brand/primary`
- `brand/onPrimary`
- `border/default`
- `status/studying`
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
- `FocusOn/display`
- `FocusOn/title2`
- `FocusOn/title3`
- `FocusOn/body`
- `FocusOn/bodySmall`
- `FocusOn/label`
- `FocusOn/caption`

New local Figma variables created for this screen:

- `status/away`
- `status/paused`
- `status/cameraOff`
- `status/reconnecting`
- `feedback/error`
- `background/sessionCanvas`
- `background/sessionTile`
- `background/sessionOverlay`
- `background/sessionScrim`
- `text/onDark`
- `text/onDarkMuted`

The new variables are semantic additions for the dark, long-running room context. They should be reviewed before being promoted to `packages/design-tokens`.

## Components

Existing reusable components before this work:

- `Button/SingleRoom`
- `Button/MultiRoom`
- `Card/StudySummary`

Those components are home-screen-specific and were not reused in this room screen.

New local Figma component set:

- `ParticipantTile`

Variants:

- `Status=Studying, Self=false`
- `Status=Away, Self=false`
- `Status=Paused, Self=false`
- `Status=CameraOff, Self=false`
- `Status=Connecting, Self=false`
- `Status=Reconnecting, Self=false`
- `Status=Studying, Self=true`

The screen frames use `ParticipantTile` instances. Future room states should extend this component set rather than duplicating tile primitives.

## Implementation Notes For AI Agents

Before coding this screen:

1. Read `DESIGN.md`, `docs/screen-ownership.md`, `apps/mobile/AGENTS.md`, and this document.
2. Use Figma MCP `get_design_context` for nodes `35:28` and `35:105`.
3. Implement only within `apps/mobile` unless a separate approved task changes platform boundaries.
4. Reuse `@focuson/design-tokens` and mobile UI primitives where they exist.
5. Treat `ParticipantTile` as the source for tile composition and state variants.
6. Do not add recording, face recognition boxes, AI score overlays, hand raise, screen share, reactions, moderation controls, or group discovery features.
7. Do not create 3-column or higher grid options.
8. Do not make top and bottom controls permanently visible in the default interaction model.

Implementation should use a scrollable list/grid suitable for live video tiles. In React Native this likely maps to a virtualized list with 2-column layout by default and a separate 1-column mode. Overlays should be absolutely positioned over the video grid so the grid does not resize when controls appear.

## Accessibility Requirements

- Every control must have at least a 44px touch target. Current Figma controls are 52px or taller.
- Status must be conveyed by text, not color alone.
- Nickname and study goal must support one-line truncation.
- `나` must be identifiable without relying only on border color.
- `나가기` must not look like the primary room action and must open a confirmation flow.
- The camera off state must not be confused with leaving the session.
- White-noise state should expose the currently selected sound to assistive technologies.

## Prototype And Interaction Notes

Figma MCP could not apply native prototype `reactions` in the current tool environment. Instead, the Figma file includes an external annotation:

- `Annotation/SCR-016/PrototypeInteractions`

Intended interactions:

- Tap `ControlsHidden` to show `ControlsVisible`.
- Tap empty area in `ControlsVisible` to return to `ControlsHidden`.
- Start grid scroll in `ControlsVisible` to hide controls immediately.
- Auto-hide timer is an implementation behavior, not represented as a native Figma prototype reaction.

## Current Limitations

- Only 2-column default frames were created.
- 1-column layout is represented by the bottom toggle but not by a separate screen frame.
- Exit confirmation dialog is not designed in this task.
- Report target selection flow is not designed in this task.
- White-noise selection sheet is not designed in this task.
- Participant video is represented by editable neutral placeholders, not real people or raster images.
- The current Figma font is Inter because it is available in Figma. Runtime mobile implementation should follow `DESIGN.md` and use platform system fonts unless the team decides otherwise.

## Review Checklist

- Decide whether `status/cameraOff` should remain neutral gray in session UI or use the existing red semantic from `DESIGN.md`.
- Decide whether the dark session variables should be promoted into `packages/design-tokens`.
- Add a separate 1-column frame if product review needs side-by-side comparison.
- Add exit confirmation, report target selection, and white-noise selection screens in separate design passes.
- Validate the LiveKit tile aspect ratio against real iOS and Android devices.
- Confirm whether mobile native owns this screen long-term or whether any room surface remains web-owned after MVP architecture decisions.
