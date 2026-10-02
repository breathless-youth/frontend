---
name: pnpm-patch-retarget
description: "pnpm 10 저장소에서 patches/의 의존성 패치를 새 라이브러리 버전에 다시 다는 절차. pnpm patch·pnpm patch-commit으로 재타깃하고, 두 업스트림 버전을 내려받아 diff해 업스트림이 문제를 고쳤는지 증명하며, pnpm-workspace.yaml의 patchedDependencies 키와 패치를 고정하는 테스트(webviewPatch.test.ts)를 함께 갱신한다. 'react-native-webview 패치 올려', '패치 재타깃', 'patch-commit', 'ERR_PNPM_UNUSED_PATCH', '패치가 안 먹어', '업스트림이 고쳤는지 확인', 'expo-constants 패치 떼도 돼?', 'messaging 패치 확인', '패치만 다시', '패치 테스트 수정', '이전 결과 기반으로 보완', '재실행', '업데이트', '수정' 같은 요청에 반드시 이 스킬을 사용할 것. 새 패치를 처음 만드는 일이나 라이브러리 자체를 업스트림에 기여하는 일은 범위가 아니다."
---

# pnpm 패치 재타깃

라이브러리 버전이 바뀌면 `patches/`의 패치는 옛 버전 키에 묶여 적용되지 않는다. pnpm 10은 쓰이지 않는 패치를 설치 오류로 처리하지만, 키를 지워 오류를 넘기면 패치가 아무 경고 없이 빠지고 고쳤던 버그가 실기기에서만 되살아난다. 이 스킬은 패치를 새 버전에 다시 달거나, 업스트림이 고쳤다는 증거를 갖고 떼는 절차다.

## 이 저장소의 패치 현황 (2026-10-01)

| 패치 파일 | 무엇을 고치나 | 고정 장치 |
|---|---|---|
| `react-native-webview@13.15.0.patch` | iOS Fabric 래퍼가 배경색을 안쪽 WKWebView에 넘기지 않는 문제(흰 줄), 앞으로가기 가장자리 스와이프만 끄기(BY-775) | `webviewPatch.test.ts`가 문자열과 호출 횟수를 단언한다 |
| `@react-native-firebase__messaging@26.3.3.patch` | v26 TurboModule 전환에서 빠진 main-queue `methodQueue` 복원, `getToken`이 APNs 토큰 유무로 판단 | 키와 파일 존재만 단언한다 |
| `expo-constants@18.0.13.patch` | `EXConstants.podspec`의 `PROJECT_ROOT`·`$PODS_TARGET_SRCROOT` 재인용(경로 공백 대비, 지금은 예방용) | 키와 파일 존재만 단언한다 |

설정 위치는 `pnpm-workspace.yaml`의 `patchedDependencies`다. 루트 `package.json`에는 `pnpm` 필드가 없어야 한다. pnpm 10은 그 필드를 읽지 않기 때문에, 거기 적힌 패치는 lockfile을 새로 만드는 순간 빠진다.

## 판단 순서

패치마다 아래 순서로 결론을 하나 낸다. 결론과 근거를 보고서 표에 적는다.

1. **유지**: 라이브러리 버전이 그대로다. 키도 파일도 바꾸지 않고 적용만 확인한다(절차 C).
2. **제거**: 업스트림이 패치의 모든 수정을 담았다. diff 증거가 있어야 한다(절차 A → D).
3. **부분 제거**: 업스트림이 일부만 고쳤다. 해결된 hunk와 그 단언만 지우고 파일은 남긴다(절차 A → B).
4. **재타깃**: 업스트림이 고치지 않았다. 새 버전에 다시 단다(절차 A → B).
5. **예방용 패치가 충돌**: 실제 버그가 아니라 예방용이고 새 버전에서 깨끗이 적용되지 않으면 뗄 수 있다. 이 저장소에서는 `expo-constants` 패치가 여기에 해당한다(`docs/runbooks/local-dev-build.md`가 허용한다).

## 절차 A: 업스트림이 고쳤는지 증명

변경 기록만 보고 판단하지 않는다. 변경 기록에 없는 수정도 있고, 있다고 적힌 수정이 다른 경로를 고친 경우도 있다. 두 버전의 실제 파일을 비교한다.

```bash
W="$SCRATCH/upstream"; mkdir -p "$W" && cd "$W"
npm pack react-native-webview@13.15.0 react-native-webview@13.16.1 --pack-destination "$W"
mkdir old new
tar -xzf react-native-webview-13.15.0.tgz -C old
tar -xzf react-native-webview-13.16.1.tgz -C new
diff -ru old/package new/package -x '*.map' > webview.diff
```

- 패치가 건드리는 파일(`diff --git a/...` 줄)만 먼저 본다. 그 파일이 diff에 없으면 업스트림은 그 부분을 바꾸지 않았다.
- 바뀌었다면 패치의 각 hunk가 고치려던 줄이 새 버전에서 어떻게 됐는지 확인한다. 같은 수정이 들어갔으면 해결, 주변만 바뀌었으면 미해결이다.
- hunk마다 "해결 / 미해결 / 대상 코드가 사라짐" 중 하나로 판정해 표로 남긴다.
- 네트워크가 막히면 `curl -sfL https://unpkg.com/<패키지>@<버전>/<파일경로>`로 파일 하나씩 받아 비교한다. Homebrew Python의 urllib은 루트 인증서가 없어 HTTPS가 실패하니 쓰지 않는다.

변경 기록(GitHub 릴리스, CHANGELOG)은 diff 결과를 설명하는 보조 근거로만 쓴다.

## 절차 B: 새 버전에 다시 달기

키가 옛 버전이면 설치가 `ERR_PNPM_UNUSED_PATCH` 같은 오류로 멈춘다. 이 하네스에서는 의존성 정렬 단계가 옛 키를 미리 지워 두므로, 여기서는 새 키를 만드는 일만 남는다.

```bash
# 1. 새 버전의 원본을 편집 디렉터리로 꺼낸다
pnpm patch react-native-webview@13.16.1 --edit-dir "$SCRATCH/rnw-edit"

# 2. 옛 패치를 먼저 시험 적용한다
cd "$SCRATCH/rnw-edit"
patch -p1 --dry-run < <저장소 루트>/patches/react-native-webview@13.15.0.patch

# 3. 깨끗하면 실제로 적용한다
patch -p1 < <저장소 루트>/patches/react-native-webview@13.15.0.patch

# 4. 저장소 루트에서 커밋한다 (patches/ 파일 생성, 설정 키 추가, 설치까지 한다)
cd <저장소 루트> && pnpm patch-commit "$SCRATCH/rnw-edit"
```

- 2단계에서 `FAILED`나 `.rej`가 나오면 거부된 hunk를 새 코드에 손으로 다시 적용한다. 이때 hunk 안의 한국어 주석도 함께 살린다. 주석이 패치의 이유를 설명하는 유일한 기록이기 때문이다.
- `patch -p1`이 offset·fuzz 경고만 내고 성공했다면, 적용된 위치가 의도한 함수 안인지 편집 디렉터리의 파일을 열어 확인한다. fuzz는 엉뚱한 자리에 붙을 수 있다.
- `patch-commit`이 끝나면 다음을 확인한다.
  - `pnpm-workspace.yaml`에 새 키(`react-native-webview@13.16.1: patches/react-native-webview@13.16.1.patch`)가 생겼다.
  - 루트 `package.json`에 `pnpm` 필드가 생기지 않았다. 생겼으면 그 내용을 `pnpm-workspace.yaml`로 합치고 필드를 지운다.
  - 옛 키 줄과 옛 패치 파일이 남아 있으면 지운다.
  - `patch-commit`은 `pnpm-workspace.yaml`을 통째로 다시 쓴다. 따옴표 스타일이 바뀌고 주석이 사라진다. `git diff pnpm-workspace.yaml`이 키 줄 변경만 보이도록 원래 모양으로 되돌린 뒤 키만 바꾸고 `pnpm install`을 한 번 더 돌린다(2026-10-01 첫 실행에서 겪음).
  - `pnpm install` 뒤 `node_modules` 안에 lockfile 밖 사본(`supports-color`, `hermes-estree`, `@react-native/babel-preset` 아래 codegen 등)이 생길 수 있다. 상위에 같은 버전이 있으면 해석에 영향이 없으니 그 사본만 지우고, 확인 스크립트로 untracked 0을 본다.
  - scoped 패키지 파일명은 `/`가 `__`로 바뀐다(`@react-native-firebase__messaging@26.3.3.patch`).
- 새 패치 파일의 diff가 원래 의도한 변경만 담고 있는지 읽는다. 편집 디렉터리에 남은 `.orig`·`.rej` 파일이 패치에 섞이면 안 된다. 섞였으면 그 파일을 지우고 `patch-commit`을 다시 한다.

## 절차 C: 유지하는 패치 확인

버전이 그대로인 패치도 다른 패키지 변경 때문에 lockfile이 바뀌면 빠질 수 있다.

- `pnpm-lock.yaml` 맨 위 `patchedDependencies`에 그 키와 `hash`가 있고, 패키지 항목이 같은 버전에 `(patch_hash=...)`를 달고 해석되는지 본다.
- 설치본에 패치 내용이 들어 있는지 본다. 예: `grep -n "focusmakers patch" node_modules/@react-native-firebase/messaging/ios/RNFBMessaging/RNFBMessagingModule.mm`.
- messaging은 26.3.3 유지로 결정되어 있다. RN 0.86에서 iOS 빌드가 이 파일 때문에 깨질 때만 26.4.0 이상과 절차 A로 비교하고, 결론을 사용자에게 먼저 보고한다. 26.4.0 변경 기록에는 `methodQueue` 복원이나 `getToken` 판정 변경이 없었다(2026-10-01 확인).

## 절차 D: 패치 제거

- `pnpm-workspace.yaml`의 키 줄과 `patches/`의 파일을 지운다.
- 고정 테스트의 `PATCHES` 맵에서 그 항목과 관련 단언을 지운다.
- 문서에서 그 패치를 설명하는 절을 고친다. 제거 이유와 diff 근거를 한 줄로 남긴다.
- `pnpm install`로 lockfile의 패치 해시가 빠졌는지 확인한다.

## 고정 테스트 갱신

`apps/mobile/lib/__tests__/webviewPatch.test.ts`가 패치 선언을 지킨다. 재타깃하면 아래를 함께 바꾼다.

- `PATCHES` 맵의 키와 파일 경로를 새 버전으로 바꾼다.
- `PATCHES["react-native-webview@13.15.0"]`로 조회하는 곳 3개를 새 키로 바꾼다. 하나라도 남으면 `undefined` 경로를 읽어 테스트가 실패한다.
- 내용 단언은 문자열이 그대로 패치에 있어야 한다: `setBackgroundColor`, `RCTUIColorFromSharedColor`, `static void RNCDisableForwardNavigationGesture(WKWebView *webView)`, `UIScreenEdgePanGestureRecognizer`, `.edges == forwardEdge`, `recognizer.enabled = NO;`, 그리고 `+` 줄의 `RNCDisableForwardNavigationGesture(_webView);` 정확히 2회.
- 단언을 패치에 맞춰 느슨하게 고치지 않는다. 단언이 실패하면 패치 쪽이 빠진 것이다. 업스트림이 해결해 hunk를 지운 경우에만 그 단언을 지운다.
- 테스트 머리 주석은 버전 번호를 적지 않으므로 고칠 필요가 없다.

실행: `pnpm --filter mobile exec jest lib/__tests__/webviewPatch.test.ts`.

## 설치본에 실제로 들어갔는지 확인

테스트는 패치 파일만 본다. 설치된 라이브러리에 적용됐는지는 따로 본다.

```bash
grep -n "RCTUIColorFromSharedColor" node_modules/react-native-webview/apple/RNCWebView.mm
grep -c "RNCDisableForwardNavigationGesture(_webView);" node_modules/react-native-webview/apple/RNCWebViewImpl.m
```

hoisted 설치라 대부분 루트 `node_modules`에 있다. 없으면 `apps/mobile/node_modules/` 아래를 본다. iOS podspec이나 네이티브 파일을 바꾼 패치는 로컬 빌드 전에 `pod install`을 손으로 돌려야 반영된다(`expo run:ios`는 podspec 내용 변경을 감지하지 못한다).

## 함께 고칠 문서·주석

패치 파일명이나 라이브러리 버전을 직접 적은 곳을 `git grep -n "<패키지>@<옛 버전>"`과 `git grep -n "<패키지> <옛 버전>"`으로 찾는다. 이번 작업의 목록은 `.claude/skills/expo-sdk-upgrade/references/touchpoints.md` 2절에 있다. 주석의 "13.15.0 iOS History API shim" 같은 동작 서술은 절차 A에서 그 코드가 바뀌지 않았음을 확인한 뒤에만 번호를 바꾼다. 바뀌었으면 번호를 바꾸지 말고 보고서에 적는다.

## 보고서 형식

`_workspace/03_patcher_patches.md`

```markdown
# 패치 재타깃 보고서

## 상태
모듈 완료 | 차단됨 | 일부 완료

## 패치별 결론
| 패치 | 이전 키 | 이후 키 | 결론(유지·재타깃·부분 제거·제거) | 근거 |

## hunk 판정
| 패치 | hunk(파일·함수) | 업스트림 판정 | 적용 방식(깨끗·fuzz·수동) |

## 바꾼 파일
- 절대경로: 무엇을 왜

## 검증
- webviewPatch.test.ts 결과
- 설치본 grep 결과
- pnpm install 종료 코드

## 남은 일·질문
```
