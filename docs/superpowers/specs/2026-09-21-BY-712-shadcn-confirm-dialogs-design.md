# BY-712 세션 확인 다이얼로그를 Radix 기반으로 교체

## 배경

세션 화면에서 쓰는 확인 다이얼로그 두 개가 Radix를 쓰지 않고 손으로 만들어져 있다. 종료 확인인 `SessionConfirmDialog`와 카메라 켜기 확인인 `CameraOnConfirmDialog`다. 포커스 트랩, 포커스 복귀, Escape 처리, 딤 탭 처리를 각자 구현해 뒀고 두 파일에 같은 코드가 겹쳐 있다.

BY-710에서 오버레이 모션을 넣을 때 이 둘만 빠졌다. 호출부가 `{열림 && <다이얼로그 />}` 꼴이라 닫히는 순간 React가 DOM에서 바로 걷어내고, 나가는 모션이 한 프레임도 보이지 않는다. Radix로 바꾸면 애니메이션이 끝날 때까지 기다렸다 걷어내는 일을 라이브러리가 대신한다.

## 착수 전 검증한 사실

티켓이 적어 둔 제약 다섯 가지를 코드로 확인했다. 두 가지가 실제와 달랐다.

### 배치 제약은 교체로 해소된다

티켓은 `SessionConfirmDialog`가 세션 레이아웃 레이어의 자식이 아니라 형제여야 한다고 적었다. 자식으로 넣으면 좌상단에 앉고 타이머가 밀리고 버튼이 클릭을 못 받는다는 것이다.

이 문제는 컴포넌트가 `absolute inset-0`으로 부모를 기준 삼기 때문에 생긴다. Radix Portal을 쓰면 배치가 부모 레이아웃에서 분리되므로 사라진다. 세션 `<main>`이 `h-svh w-full`이라 지금의 `absolute inset-0`과 Radix의 `fixed inset-0`이 실질적으로 같은 영역을 덮는다. 배경음 시트가 이미 같은 방식으로 돌고 있다.

### 색 변수 제약은 둘 중 하나에만 해당한다

티켓은 두 다이얼로그가 모두 항상 다크이고 세션 서브트리 변수를 읽는다고 적었다. 확인해 보니 `SessionConfirmDialog`만 그렇다. `--session-dialog-*`를 읽으므로 `body`로 포털하면 색이 통째로 빠진다.

`CameraOnConfirmDialog`는 `bg-background`, `bg-primary`, `bg-bg-layer-2` 같은 전역 토큰만 쓰고 라이트와 다크를 따른다. `body`로 나가도 색이 깨지지 않는다.

### 포커스 복귀는 Radix가 대신하지 않는다

Radix는 `Trigger`를 쓸 때만 스스로 포커스를 되돌린다. 두 다이얼로그는 `open` prop으로만 열리므로 직접 처리해야 한다. `onOpenAutoFocus`가 포커스를 Content로 옮기기 직전에 불려 그 시점의 `document.activeElement`가 아직 트리거이므로, 이것을 기억해 `onCloseAutoFocus`에서 되돌린다.

### `inert`는 Radix가 대신하는 것이 아니라 걷어내야 한다

`RoomPage`는 손으로 만든 다이얼로그가 떠 있을 때 세션 화면을 `inert`로 만든다. 그 옆에 이미 경고가 적혀 있다. Radix 위에 `inert`를 겹치면 포커스를 돌려줄 버튼이 이미 `inert`라 복귀가 티 나지 않게 실패한다. 배경음 시트를 붙일 때 겪은 문제다.

따라서 교체와 함께 `inert` 처리를 제거해야 한다. 이것은 선택이 아니라 필수다.

### Escape 동작은 둘이 다르다

종료 확인은 되돌릴 수 없어서 Escape를 비파괴 취소로 둔다. 카메라 확인은 취소 자체가 하나의 선택이라 `dismissable`이 false면 Escape를 무시한다. `busy`일 때도 무시한다. Radix의 `onEscapeKeyDown`에서 `preventDefault`로 구현한다.

## 확정한 결정

### 구조는 공용 `dialog.tsx`를 그대로 쓴다

세션 전용 공용 컴포넌트를 새로 만들지 않는다. 두 다이얼로그의 생김새가 서로 많이 달라서 묶어도 주입할 것이 늘어나기만 한다. 각자 공용 `dialog.tsx`를 import해 클래스로 차이를 낸다.

`dialog.tsx`에는 prop 둘을 더한다. 시트가 이미 가진 것과 같은 형태이고 같은 이유다.

- `container` 는 Portal이 그려질 자리다. 세션 변수를 읽는 쪽이 세션 `<main>`을 넘긴다.
- `overlayClassName` 은 딤에 얹을 클래스다. 세션 딤은 카메라 위에서 뒤가 비치지 않게 전역 딤보다 어둡다.

새 의존성은 받지 않는다. `role="alertdialog"`는 기존 `@radix-ui/react-dialog`의 Content에 props로 넘기면 된다.

### 카메라 확인의 딤 탭은 지금처럼 닫지 않는다

현재 딤에 아무 처리가 없어 탭해도 닫히지 않는다. Radix는 기본으로 닫으므로 `onPointerDownOutside`에서 막아 현재 동작을 지킨다. `dismissable`과 무관하게 항상 막는다. 교체는 구조 변경이라 사용자가 느낄 동작은 건드리지 않는 편이 안전하다.

종료 확인의 딤 탭은 지금도 비파괴 취소로 닫히고 Radix 기본 동작과 같아 그대로 둔다.

## 설계

### 공용 `dialog.tsx`

`DialogContentProps`에 `container`와 `overlayClassName`을 더하고, `DialogPortal`에 `container`를 넘기고 `DialogOverlay`에 `overlayClassName`을 전달한다. 기존 호출부는 두 prop을 주지 않으므로 동작이 바뀌지 않는다.

### `SessionConfirmDialog`

Radix 기반으로 다시 쓴다. 지워지는 것이 많다.

| 지워지는 것                                          | 대신하는 것                                   |
| ---------------------------------------------------- | --------------------------------------------- |
| `useEffect` 포커스 관리                              | Radix 기본 동작과 `onCloseAutoFocus`          |
| `handleKeyDown`의 Tab 포커스 트랩                    | Radix                                         |
| Escape 분기                                          | `onOpenChange`                                |
| 딤 역할의 `aria-hidden` 버튼                         | `DialogOverlay`                               |
| `useId` 두 개와 `aria-labelledby`·`aria-describedby` | `DialogTitle`·`DialogDescription`의 자동 연결 |

남기는 것은 `dialogActionVariants`와 항상 다크인 색이다. `showCloseButton`은 false로 둔다. X 버튼이 없는 화면이다.

Props에 `open`과 `container`가 더해진다. 포커스 복귀는 ref를 받지 않고 다이얼로그가 스스로 한다. `onOpenAutoFocus`가 포커스를 Content로 옮기기 직전에 불리므로 그 시점의 `document.activeElement`가 아직 트리거다. 이것을 기억해 `onCloseAutoFocus`에서 되돌리되, 세션이 그사이 끝나 요소가 사라졌을 수 있어 `isConnected`인 것에만 포커스한다.

### `CameraOnConfirmDialog`

같은 방식이다. 전역 토큰만 쓰므로 `container`를 주지 않고 `body`로 포털한다. `dismissable`이 false이거나 `busy`면 Escape를 막고, 딤 탭은 항상 막는다. 미리보기 슬롯과 오류 메시지 자리는 그대로 둔다.

### 호출부

`RoomPage`와 `LiveRoomSession` 둘 다 조건부 렌더를 `open` prop으로 바꾼다. `RoomPage`의 `overlayOpen` 변수와 그것을 쓰는 `inert` 두 곳, `LiveRoomSession`의 `inert={dialogOpen}`을 제거한다. 종료 확인은 세션 변수를 읽으므로 세션 `<main>`을 `container`로 넘긴다. `LiveRoomSession`은 `<main>`에 ref를 새로 붙인다.

`RoomPage`의 `inert` 중 하나는 딤 뒤를 탭해도 심플 모드가 토글되지 않게 하는 목적이다. Radix가 바깥 포인터 이벤트를 막으므로 같은 결과가 나온다. 구현 중 실제로 그런지 확인한다.

## 테스트

두 다이얼로그의 전용 테스트 파일이 없다. 지금은 호출부 테스트가 버튼 이름으로 접근해 간접 검증하고 있고, 그 테스트들이 교체의 회귀 감시망 역할을 한다.

전용 테스트를 두 개 새로 만들어 아래를 고정한다.

| 케이스                                                         | 대상      |
| -------------------------------------------------------------- | --------- |
| `role="alertdialog"`로 노출된다                                | 둘 다     |
| 초기 포커스가 비파괴 버튼에 놓인다                             | 둘 다     |
| 닫으면 열기 전 포커스로 돌아간다                               | 둘 다     |
| 복귀 대상이 DOM에서 떨어졌으면 그 요소에 focus를 부르지 않는다 | 카메라    |
| Escape가 비파괴 취소를 부른다                                  | 종료 확인 |
| 딤을 탭하면 비파괴 취소가 불린다                               | 종료 확인 |
| `dismissable`이 false면 Escape가 무시된다                      | 카메라    |
| `busy`면 Escape가 무시된다                                     | 카메라    |
| 딤을 탭해도 닫히지 않는다                                      | 카메라    |

닫는 모션이 끝난 뒤에 요소가 걷히는지는 테스트로 잡지 않는다. jsdom이 CSS를 계산하지 않아 Radix가 늘 즉시 언마운트하므로, 통과해도 실제 동작을 증명하지 못한다. BY-710에서 확인한 것과 같은 이유다. 이 계약은 브라우저에서 본다.

## 완료 조건

- 두 다이얼로그가 공용 `dialog.tsx`를 쓴다.
- 열고 닫을 때 모션이 붙고 닫는 모션이 끝난 뒤에 요소가 걷힌다.
- 모션 축소 환경에서 움직임이 빠지고 페이드만 남는다.
- `role="alertdialog"`, 초기 포커스, 포커스 트랩, 포커스 복귀가 지켜진다.
- Escape 동작이 두 다이얼로그에서 각각 지금과 같다.
- 카메라 확인의 딤 탭이 지금처럼 닫지 않는다.
- `inert` 처리가 제거되고 포커스 복귀가 실제로 동작한다.
- 겹쳐 있던 포커스 관리 코드가 줄어든다.
- 라이트와 다크 스크린샷, 모션 축소 확인이 첨부된다.
