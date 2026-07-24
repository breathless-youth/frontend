# SCR-002 Auth

> ⚠️ **V1.2+ 보류** (2026-07-24): 로그인은 `.ai/product/roadmap.md` 기준 V1.2에서 도입한다. V1.0 작업에서 이 문서를 참조·구현하지 않는다.

## Purpose

FocusOn 모바일 앱의 로그인 화면이다. 사용자가 FocusOn의 서비스 정체성을 짧게 인지한 뒤 Google 또는 Apple 계정으로 진입하는 역할을 한다.

이 화면은 회원가입과 로그인을 별도 버튼으로 분리하지 않는다. 소셜 로그인 성공 후 서버 또는 인증 상태에 따라 신규 회원 여부를 판단하고 다음 화면을 결정한다.

## Source Of Truth

- Figma file: `FocusON`
- Figma file URL: <https://www.figma.com/design/awZQ0hSGuxwMHkLfZZhsjl/FocusON>
- Figma section: `02_Authentication`
- Figma frame: `Screen/SCR-002/Auth/Default`
- Figma node: `42:194`
- Figma component set: `SocialLoginButton`
- Component set node: `42:35`
- Figma page: `05_Screens`
- Design system: `DESIGN.md`
- Ownership: `docs/screen-ownership.md`
- Mobile target: `apps/mobile`

Figma is the visual source of truth for this screen. Code implementation must read this frame through Figma MCP before implementation and map the result to the mobile app architecture instead of copying absolute Figma coordinates blindly.

## Ownership Boundary

Mobile owns this screen as part of the native app shell.

This screen may call Google and Apple native authentication flows. It must not request camera permission, show study-room previews, implement WebView study-room internals, or add unsupported login providers.

According to the current project screen ownership document:

- `SCR-002` is login.
- `SCR-004` is home.
- Study-room screens are separate from the auth flow.

If the product needs a dedicated profile setup screen after first login, assign that screen ID in `docs/screen-ownership.md` before implementation.

## Current Figma Structure

```text
Screen/SCR-002/Auth/Default
  Section/BrandHero
    Brand/Wordmark
    Illustration/BrandHero
      Shape/FocusOrb/Large
      Shape/FocusOrb/Primary
      Shape/FocusOrb/Soft
      Object/DeskSurface
      Object/Book
      Object/Notebook
      Object/Pencil
      Connection/StudyFlow/A
      Connection/StudyFlow/B
      Connection/StudyFlow/Line
  Section/AuthActions
    Text/AuthHeadline
    Text/AuthDescription
    Spacing/HeadlineToButtons
    Actions/SocialLogin
      SocialLoginButton/Google
      SocialLoginButton/Apple
    Legal/AuthConsent
      Legal/Line1
        Text/ConsentPrefix
        Link/Terms
        Text/ConsentMiddle
        Link/Privacy
      Legal/Line2
        Text/ConsentSuffix
```

Frame size is `393 x 852`, matching an iPhone 15-level mobile portrait frame. The top brand area occupies about 60% of the screen, and the bottom auth action area occupies about 40%.

## Content

Brand area:

- `FocusOn`
- Editable abstract illustration showing calm focus, study tools, and a connected study flow.

Auth action area:

- Headline: `집중을 시작해볼까요?`
- Description: `계정으로 로그인하고 공부 기록을 이어가세요`
- Google button: `Google로 계속하기`
- Apple button: `Apple로 계속하기`
- Legal copy: `계속하면 이용약관 및 개인정보 처리방침에 동의하게 됩니다.`

The legal copy is split across two centered lines in Figma to avoid clipping on a 393px-wide frame.

## Auth Flow Contract

Only two providers are supported:

```ts
type AuthProvider = "google" | "apple";
```

Successful authentication should branch by backend or local profile state:

```ts
type AuthResultRoute =
  | { type: "existing-user"; nextScreen: "SCR-004" }
  | { type: "new-user"; nextScreen: "PROFILE_SETUP_UNASSIGNED" };
```

`SCR-004` is the current project-documented home screen. `PROFILE_SETUP_UNASSIGNED` is intentionally not mapped to a screen ID yet because `docs/screen-ownership.md` does not currently assign a dedicated profile setup screen.

## Interaction Contract

`SocialLoginButton/Google`:

- Starts the Google native auth flow.
- Uses the official multi-color Google mark.
- The whole 345 x 56 button is the touch target.
- Default, pressed, and loading variants exist in the Figma component set.

`SocialLoginButton/Apple`:

- Starts the Apple native auth flow when available.
- Uses high-contrast dark surface with white Apple icon and text.
- The whole 345 x 56 button is the touch target.
- Default, pressed, and loading variants exist in the Figma component set.
- Android implementation may hide this provider if the team's auth policy requires it, but the default Figma frame shows both providers.

Legal links:

- `이용약관` should open the terms screen or web fallback.
- `개인정보 처리방침` should open the privacy screen or web fallback.
- No checkbox is shown on this screen.

## Reference Usage

The external reference image was used only for layout and information hierarchy:

- Top brand/illustration area.
- Bottom login action area.
- Two stacked social login buttons.

The following were not copied:

- `moimoi` wordmark.
- Character design.
- Color palette.
- Speech bubbles.
- Illustration style.

FocusOn reinterprets the layout with its own wordmark, calm brand colors, and an editable abstract study illustration.

## Design Tokens Used

Existing tokens reused:

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
- `radius/medium`
- `radius/full`
- `FocusOn/display`
- `FocusOn/title2`
- `FocusOn/title3`
- `FocusOn/body`
- `FocusOn/bodySmall`
- `FocusOn/label`
- `FocusOn/caption`

No new Figma variables were required for this screen.

## Components

Existing reusable components before this work:

- `Button/SingleRoom`
- `Button/MultiRoom`
- `Card/StudySummary`
- `ParticipantTile`

Those components are not appropriate for auth and were not reused.

New local Figma component set:

- `SocialLoginButton`

Variants:

- `Provider=Google, State=Default`
- `Provider=Google, State=Pressed`
- `Provider=Google, State=Loading`
- `Provider=Apple, State=Default`
- `Provider=Apple, State=Pressed`
- `Provider=Apple, State=Loading`

The default screen uses only the Google and Apple default instances. Pressed and loading variants exist for implementation mapping.

## Implementation Notes For AI Agents

Before coding this screen:

1. Read `DESIGN.md`, `docs/screen-ownership.md`, `apps/mobile/AGENTS.md`, and this document.
2. Use Figma MCP `get_design_context` for node `42:194`.
3. Implement only within `apps/mobile`.
4. Do not add email, password, Kakao, Naver, Facebook, guest login, or separate sign-up buttons.
5. Do not request camera permission on this screen.
6. Do not add ranking, study stats, room previews, marketing banners, or onboarding permission copy.
7. Keep the Google and Apple buttons equal in visual priority.
8. Keep the brand illustration editable or code-native; do not rasterize the screen.

Implementation should map the screen to a non-scrolling safe-area layout. On smaller devices, the illustration height should be allowed to shrink before the login buttons or legal text are clipped.

## Accessibility Requirements

- Social login buttons must be exposed as buttons with clear provider labels.
- Each login button must have at least a 44px touch target. Current Figma height is 56px.
- Google and Apple icons must not be the only accessible provider indicator.
- Legal links must be individually reachable if implemented as links.
- Text contrast must remain readable on both the soft brand background and the white auth area.
- No text should be rendered as an image.

## Current Limitations

- Only the default screen frame exists.
- Loading and error states are represented as button variants only, not as separate screen frames.
- The brand illustration is an editable abstract shape composition and should be reviewed by design before final brand lock.
- The current Figma font is Inter because it is available in Figma. Runtime mobile implementation should follow `DESIGN.md` and use platform system fonts unless the team decides otherwise.
- A dedicated profile setup screen ID is not currently assigned in `docs/screen-ownership.md`.

## Review Checklist

- Assign or confirm the profile setup screen ID before wiring the new-user auth route.
- Confirm whether Apple login is always visible on Android or conditionally hidden by platform policy.
- Review the abstract brand illustration for final FocusOn brand fit.
- Decide whether `SocialLoginButton` should be promoted into the shared mobile UI component set after implementation.
- Add auth error and provider loading screen states in a separate design pass if product wants full state coverage.
