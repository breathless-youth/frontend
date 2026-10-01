---
name: expo-upgrade-orchestrator
description: "FocusMakers apps/mobile의 Expo SDK 54 → 57 업그레이드(BY-762) 하네스 오케스트레이터. 선행 PR 확인 → 의존성 정렬(expo-upgrade-executor) → 패치 재타깃(native-patch-maintainer)과 테스트·설정·문서 갱신 병렬 → 모듈별 점진 QA(upgrade-qa) → 사용자 실기기 게이트 → 통합 보고까지 조율한다. 'Expo SDK 업그레이드 시작', 'SDK 57 작업하자', 'BY-762 진행', 'RN 0.86 올리기', 'expo 올리는 작업 이어서', 'BY-803·804·805·806·807', '패치만 다시', 'QA만 다시', '실기기 결과 나왔어 반영해줘', 'EAS 이미지 다시 확인', '문서만 업데이트', '이전 결과 기반으로 보완', '재실행', '다시', '업데이트', '수정', '보완' 등 SDK 업그레이드의 착수·후속·부분 재실행 요청에 반드시 이 스킬을 사용할 것. SDK 58, NativeTabs 이관(BY-770), NativeWind v5, 단순 버전 질문은 이 하네스 범위가 아니다. Jira 티켓·브랜치·PR 절차는 task-workflow 스킬이 감싸고, 이 스킬은 그 5단계(작업 실행) 안에서 돈다."
---

# Expo Upgrade Orchestrator

Expo SDK 54 → 57 업그레이드(BY-762)를 세 전문 에이전트로 나눠 실행한다. Jira·브랜치·PR은 `task-workflow`가 맡고, 이 스킬은 그 5단계(작업 실행) 안에서 돈다. 끝나면 6단계(도식화·요약 제출)로 넘긴다.

| 하위 티켓 | 내용 | 담당 |
|---|---|---|
| BY-803 | 의존성 정렬·typecheck | expo-upgrade-executor (`deps`) |
| BY-804 | pnpm 패치 3개 | native-patch-maintainer |
| BY-805 | `useIsFocused`·테스트 mock 이관 + jest-expo 57 | expo-upgrade-executor (`deps`에서 소스, `code-docs`에서 테스트) |
| BY-806 | eas.json·app.config·CLAUDE.md·런북 갱신 | expo-upgrade-executor (`code-docs`) |
| BY-807 | 실기기 검증·EAS staging·Sentry 소스맵 | 사용자 (Phase 5) |

## 실행 모드: 서브 에이전트

에이전트 팀이 기본값이지만 이 하네스는 서브 에이전트로 돈다.

- 이 환경에는 팀 도구(`TeamCreate`·`TaskCreate`)가 없다. 있는 도구는 `Agent`·`SendMessage`뿐이다.
- 에이전트끼리 주고받는 것은 버전 표와 패치 목록이 담긴 보고서 파일이다. 실시간 토론이 필요 없고, 리더(이 세션)가 파일을 읽어 다음 에이전트에 넘기면 된다.

구조는 파이프라인이다. Phase 3 한 구간만 두 에이전트가 병렬로 돌고, QA는 모듈이 끝날 때마다 붙는 생성-검증 쌍이다. 팀 도구가 생기면 Phase 3의 두 에이전트와 QA를 팀으로 바꾼다.

## 에이전트 구성

| 에이전트 | subagent_type | model | 역할 | 스킬 | 출력 |
|---|---|---|---|---|---|
| expo-upgrade-executor | general-purpose | opus | 의존성 정렬, 소스·테스트 이관, 설정·문서 갱신 | expo-sdk-upgrade, expo-upgrade(OSS), doc-writing | `02_executor_deps.md`, `03_executor_tests.md`, `03_executor_config-docs.md` |
| native-patch-maintainer | general-purpose | opus | 패치 재타깃·유지·제거, 고정 테스트·참조 갱신 | pnpm-patch-retarget, doc-writing | `03_patcher_patches.md` |
| upgrade-qa | general-purpose | opus | 경계면 교차 대조, 검증 명령 실행 | (에이전트 정의에 인라인), expo-sdk-upgrade의 touchpoints | `04_qa_{M1~M5}.md` |

에이전트 정의는 이 저장소의 `.claude/agents/{이름}.md`다. Agent 호출 prompt 첫 줄에 "당신의 정의는 `<저장소 루트 절대경로>/.claude/agents/{이름}.md`다. 먼저 읽어라"를 넣고, `model: "opus"`를 명시한다.

## 경로

저장소 루트(이 파일이 든 `.claude/`의 부모)를 기준으로 적는다. 기계마다 다른 절대경로는 문서에 두지 않는다.

- 코드 워크트리: `<저장소 루트>`. 브랜치는 `feature/BY-762-expo-sdk-57`, 폴더는 `<저장소 루트의 부모>/frontend-BY-762/`다.
- 작업 디렉토리: `<저장소 루트의 부모>/reports/expo-sdk-57/_workspace/`. git 밖이라 중간 산출물이 커밋되지 않는다.
- 파일명: `{phase}_{agent}_{artifact}.md`. agent는 `executor`, `patcher`, `qa`, `leader`, `user` 중 하나다.
- 에이전트 프롬프트에는 실행 시점에 확인한 절대경로를 넣는다.

## 워크플로우

### Phase 0: 컨텍스트 확인

1. `_workspace/`가 없으면 **초기 실행**이다. Phase 1로 간다.
2. `_workspace/`가 있고 사용자가 일부만 다시 하길 원하면 **부분 재실행**이다. 요청에 맞는 에이전트만 부르고, 프롬프트에 이전 보고서 경로를 넣는다.
   - "패치만 다시" → native-patch-maintainer, 이어서 QA `M2`.
   - "QA만 다시" → upgrade-qa에 지정 모듈(없으면 `M5`).
   - "실기기 결과 나왔어" → Phase 5의 결과 기록부터.
   - "문서만" → executor `code-docs`에 BY-806 문서 부분만 지정, 이어서 QA `M4`.
3. `_workspace/`가 있는데 기준이 바뀌었으면(새 dev 기준 rebase, 목표 버전 변경) **새 실행**이다. 기존 폴더 이름을 `_workspace_{YYYYMMDD_HHMMSS}/`로 바꾸고 Phase 1부터 한다.
4. 어느 경우든 가장 최근 `06_leader_summary.md`나 QA 보고서를 먼저 읽고 어디까지 왔는지 사용자에게 한 줄로 알린다.

### Phase 1: 선행 조건 (리더 직접)

1. 워크트리와 브랜치를 확인한다. `git -C <저장소 루트> branch --show-current`가 `feature/BY-762-expo-sdk-57`이 아니거나 워크트리가 없으면 `task-workflow` 1~4단계로 돌아간다.
2. 선행 PR 상태를 확인한다. `gh`가 PATH에 없으면 `export PATH="/opt/homebrew/bin:$PATH"`를 붙인다.
   - **PR #179 (BY-697)**: `apps/mobile/package.json`에 `expo-haptics`를 추가한다. 머지됐으면 `origin/dev` 기준으로 rebase한 뒤 Phase 2를 시작해 `--fix`가 `expo-haptics`도 57.x로 맞추게 한다. 아직이면 그대로 진행하고, 나중에 머지되면 rebase 후 `pnpm --filter mobile exec expo install expo-haptics`로 맞춘다. 충돌 난 lockfile은 손으로 합치지 말고 `pnpm install`로 다시 만든다.
   - **PR #219 (dev → main 릴리즈)**: 이 PR이 머지되고 SDK 54 production 빌드가 나간 뒤에만 이 브랜치를 dev에 머지할 수 있다. 브랜치 작업은 지금 시작해도 된다. 상태를 `00_input/prerequisites.md`에 적고, Phase 6 요약에 머지 조건으로 다시 적는다.
3. `_workspace/00_input/`을 만들고 다음을 둔다.
   - `decisions.md`: `expo-sdk-upgrade` 스킬의 "이미 정한 것" 표 사본과 사용자가 이번 실행에서 더한 결정.
   - `prerequisites.md`: PR 두 개의 상태, 기준 커밋(`git rev-parse origin/dev`), 확인 시각.
4. 새로 사용자 판단이 필요한 항목이 있으면 이 단계에서 묻는다. 이미 승인된 결정은 다시 묻지 않는다.

### Phase 2: 의존성 정렬 (서브 에이전트, 순차)

다음 단계가 이 결과에 의존하므로 단독으로 부르고 끝날 때까지 기다린다.

```
Agent(
  description: "SDK 57 의존성 정렬",
  subagent_type: "general-purpose",
  model: "opus",
  run_in_background: false,
  prompt: "당신의 정의는 <저장소 루트>/.claude/agents/expo-upgrade-executor.md다. 먼저 읽어라.
           모드: deps. 워크트리: <절대경로>. 작업 디렉토리: <_workspace 절대경로>.
           결정표: <_workspace>/00_input/decisions.md. 출력: <_workspace>/02_executor_deps.md"
)
```

끝나면 보고서의 상태와 "임시 조치" 절을 확인하고 QA `M1`을 부른다(Phase 4). **M1이 통과해야 Phase 3으로 간다.** lockfile의 버전 해석이 확정돼야 패치 담당이 정확한 새 버전에 패치를 달 수 있기 때문이다.

### Phase 3: 병렬 실행 (서브 에이전트, 팬아웃)

한 메시지에서 두 Agent를 `run_in_background: true`로 동시에 부른다.

| 에이전트 | 모드 | 입력 | 출력 |
|---|---|---|---|
| native-patch-maintainer | 재타깃 | `02_executor_deps.md`, `decisions.md` | 패치·설정·테스트 + `03_patcher_patches.md` |
| expo-upgrade-executor | `code-docs` | `02_executor_deps.md`, `decisions.md` | 테스트·설정·문서 + `03_executor_tests.md`, `03_executor_config-docs.md` |

파일 소유 범위를 프롬프트에 다시 적는다. 두 에이전트가 같은 `node_modules`를 쓰므로 충돌을 막는 규칙이다.

| 영역 | 소유 |
|---|---|
| `patches/`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `webviewPatch.test.ts`, `pnpm install`·`pnpm patch-commit` 실행 | native-patch-maintainer |
| 패치 파일명을 적은 문서·주석 절(touchpoints 2절) | native-patch-maintainer |
| 테스트 6개, `eas.json`, `firebaseConfig.test.ts`, `metaSdkConfig.test.ts`, 그 밖의 문서 절(touchpoints 3·4절) | expo-upgrade-executor |
| 두 쪽이 함께 고치는 파일(`apps/mobile/CLAUDE.md`, `docs/runbooks/local-dev-build.md`) | 각자 자기 절만, Edit로 |

### Phase 4: 점진 QA (서브 에이전트)

모듈 보고서가 "모듈 완료"가 될 때마다 `upgrade-qa`를 부른다. 전체가 끝난 뒤 한 번만 하지 않는다. 의존성 해석이 틀린 채로 패치를 달면 패치 작업 전체를 다시 해야 한다.

| 모듈 | 부르는 시점 | 생산자 보고서 |
|---|---|---|
| `M1 의존성` | Phase 2 직후 | `02_executor_deps.md` |
| `M2 패치` | 패치 담당 반환 직후 | `03_patcher_patches.md` |
| `M3 테스트` | `03_executor_tests.md`가 모듈 완료 | 같은 파일 |
| `M4 설정·문서` | `03_executor_config-docs.md`가 모듈 완료 | 같은 파일 |
| `M5 통합` | 모든 에이전트가 끝나고 M1~M4가 통과한 뒤 | 전체 |

```
Agent(
  description: "업그레이드 QA M2",
  subagent_type: "general-purpose",
  model: "opus",
  run_in_background: true,
  prompt: "당신의 정의는 <저장소 루트>/.claude/agents/upgrade-qa.md다. 먼저 읽어라.
           모듈: M2 패치. 워크트리: <절대경로>. 작업 디렉토리: <_workspace 절대경로>.
           생산자 보고서: <_workspace>/03_patcher_patches.md. 출력: <_workspace>/04_qa_M2.md"
)
```

M1~M4는 다른 에이전트가 도는 동안에도 부를 수 있다. QA는 그동안 단일 테스트 파일만 돌린다. M5는 다른 에이전트가 하나도 돌지 않을 때만 부른다(전체 스위트 경합).

**실패 처리:** QA가 실패를 내면 해당 생산자를 모드 `fix`(패치 담당은 재호출)로 부르고 QA 보고서 경로를 넘긴 뒤 같은 모듈 QA를 다시 부른다. 한 모듈에서 수정-재검증은 최대 2회다. 그래도 실패하거나 QA가 "반복"을 표시하면 멈추고 사용자에게 실패 내용과 선택지를 보인다.

### Phase 5: 실기기 게이트 (사용자)

에이전트는 기기를 만질 수 없다. M5가 통과하면 `_workspace/05_leader_device-checklist.md`를 만들어 사용자에게 보이고 **여기서 멈춘다.** 결과가 올 때까지 다음 단계로 가지 않는다.

1. 로컬 Dev Client를 iOS·Android 둘 다 새로 빌드한다. 절차는 `docs/runbooks/local-dev-build.md`이고, 실기기 xcodebuild 순서와 배포 타깃 16.4는 `expo-sdk-upgrade/references/touchpoints.md` 6절에 있다. 옛 바이너리로 열면 `Cannot find native module`이 난다.
2. BY-807 체크리스트를 사용자가 실행한다.

| # | 항목 | 플랫폼 | 걸린 변경 |
|---|---|---|---|
| D1 | 앱이 시작 직후 죽지 않고 홈 웹뷰가 뜬다 | iOS·Android | 전체 |
| D2 | FCM 토큰이 발급된다 | iOS | messaging 패치 |
| D3 | 다크 모드에서 웹뷰 배경이 테마 색이고 탭 바 위 흰 줄이 없다 (기기 글자 크기를 바꿔서도 본다) | iOS | webview 패치 |
| D4 | 싱글룸·소셜룸만 회전하고 나머지 화면은 세로로 잠긴다 | iOS·Android | screens·screen-orientation |
| D5 | 딥링크가 열린다 (스킴, App Link·Universal Link) | iOS·Android | expo-router·linking |
| D6 | 강제 업데이트 게이트가 `min_supported_version`에 맞게 뜬다 | iOS·Android | remote-config |
| D7 | 하위 화면을 닫은 뒤 앞으로가기 스와이프가 막히고, 뒤로 스와이프 미리보기는 보인다 | iOS | webview 패치 (BY-775) |
| D8 | EAS staging 빌드가 성공하고 빌드 로그의 Xcode가 26.2 이상이다 | iOS·Android | eas.json 이미지 |
| D9 | staging 빌드에서 낸 오류의 Sentry 스택트레이스가 원본 소스 위치로 풀린다 | iOS·Android | Sentry metro 구성 |

EAS 빌드는 크레딧을 쓰므로 사용자가 직접 시작하거나 명시적으로 승인한 뒤에만 시작한다.

3. 사용자가 결과를 주면 `_workspace/05_user_device-results.md`에 항목별로 적는다.
   - 실패 항목은 "걸린 변경" 열로 담당 에이전트를 정해 재호출하고, 해당 QA 모듈을 다시 돌린 뒤 실패 항목만 다시 확인받는다.
   - D8에서 Xcode가 26.2 미만이면 이미지 고정을 되살리는 것으로 결정돼 있다. executor `fix`로 되살리고 QA `M4`를 다시 돈다.

### Phase 6: 통합·요약 (리더 직접)

1. 모든 보고서를 읽고 `_workspace/06_leader_summary.md`를 쓴다. 넣을 것은 다음과 같다.
   - 버전 변경 표(이전→이후)
   - 패치별 결론과 근거
   - QA 모듈별 판정
   - 실기기 결과
   - 범위 밖으로 남긴 것(SDK 58, BY-770, NativeWind v5, `eas-build-pre-install`의 cmake 같은 잔재)
   - 머지 조건: PR #219 머지와 SDK 54 production 빌드 이후에만 dev 머지
2. 커밋 계획을 `task-workflow` 5-2 표 형식(커밋 | 변경 파일 링크 | 변경 부분 | 내용)으로 만든다. 기본안은 하위 티켓별 커밋이다. `package.json`·lockfile·`pnpm-workspace.yaml`은 서로 맞물리므로 한 커밋에 묶는 편을 제안하고, 중간 커밋 단독으로는 설치가 맞지 않을 수 있다고 알린다. 커밋 제목은 한글 소문자로 시작한다(commitlint).
3. **커밋은 사용자 승인 뒤에만 하고, 푸시는 하지 않는다.** 사용자가 파일을 에디터에서 직접 검토·수정할 수 있게 작업 트리 상태로 멈춘다.
4. `task-workflow` 6단계(도식화·요약 제출)로 넘긴다. `_workspace/`는 지우지 않는다.
5. 사용자에게 "결과에서 고칠 부분이 있는지, 에이전트 구성에서 바꿀 점이 있는지" 한 번 묻고, 하네스를 고쳤으면 루트 `CLAUDE.md`의 변경 이력에 남긴다.

## 데이터 흐름

```
결정표 + 선행 PR 상태 ──► 00_input/
                            │
                 executor(deps) ──► 02_executor_deps.md ──► qa M1
                            │                                 │ 통과
              ┌─────────────┴──────────────┐ ◄───────────────┘
   patcher                          executor(code-docs)
   patches/·workspace·lockfile      테스트·eas.json·문서
   03_patcher_patches.md            03_executor_tests.md / 03_executor_config-docs.md
              │                              │
            qa M2                    qa M3 / qa M4      (실패 시 생산자 fix → 같은 모듈 재검증, 최대 2회)
              └─────────────┬──────────────┘
                          qa M5 (CI와 같은 전체 검증)
                            │
                05_leader_device-checklist.md ──► 사용자 실기기·EAS staging·Sentry
                            │
                05_user_device-results.md
                            │
                06_leader_summary.md ──► 커밋 승인 대기 ──► task-workflow 6단계
```

## 에러 핸들링

| 상황 | 전략 |
|---|---|
| 에이전트 1개 실패·중단 | 같은 프롬프트에 실패 원인을 붙여 1회 재시도한다. 재실패면 그 모듈을 "미완"으로 요약에 적고 사용자에게 알린다 |
| QA 같은 모듈 2회 실패 | 재시도를 멈추고 실패 내용, 양쪽 값, 선택지를 사용자에게 보인다 |
| `expo install`이 결정표 밖 버전을 요구 | 진행하지 않는다. 요구 내용과 근거를 사용자에게 보이고 결정을 받는다 |
| 설치가 패치 오류로 멈춤 | executor가 패치 키 임시 정리를 빠뜨린 것이다. 그 단계부터 다시 하게 한다 |
| webview 패치 hunk 거부 | 패치 담당이 손으로 다시 적용한다. 의도한 자리를 못 찾으면 패치를 버리지 않고 사용자에게 넘긴다 |
| RN 0.86에서 messaging 패치 빌드 오류 | 26.4.x와 diff 비교 결과를 받아 사용자 결정을 기다린다. 임의로 Firebase를 올리지 않는다 |
| SDK 57 기본 iOS 이미지가 Xcode 26.2 미만 | 이미지 고정을 되살린다(승인된 대응). 고정 테스트도 원래 단언으로 돌린다 |
| React 사본이 둘 | `apps/web`과 `react-test-renderer` 버전을 `react`에 맞춘다. 그래도 남으면 `pnpm why -r react` 결과를 사용자에게 보인다 |
| `react-native-fbsdk-next` 13.4.3이 RN 0.86과 안 맞음 | 버전을 바꾸지 않고 멈춘다. `metaSdkConfig.test.ts`가 고정하는 값이라 사용자 결정이 필요하다 |
| NativeWind v4·css-interop 0.2.7이 빌드를 깨뜨림 | v5로 가지 않는다. 오류와 재현 명령을 사용자에게 보인다 |
| 전체 테스트 경합 타임아웃 | 다른 에이전트가 끝난 뒤 단독으로 다시 돌린다. 실패 테스트명 없이 끝났으면 경합부터 의심한다 |
| PR #179가 작업 중 머지됨 | rebase 후 `expo-haptics`를 맞추고 `pnpm install`로 lockfile을 다시 만든 뒤 M1부터 다시 돈다 |
| 실기기 항목 실패 | 걸린 변경으로 담당을 정해 재호출하고, 해당 QA와 실패 항목만 다시 확인받는다 |
| 사용자 승인 필요 지점 | 결정표 밖 선택, EAS 빌드 시작, 앱 삭제가 필요한 재설치, 커밋에서는 멈추고 묻는다 |

## 테스트 시나리오

### 정상 흐름

1. 사용자: "BY-762 SDK 57 업그레이드 시작하자" → task-workflow 1~4단계로 티켓·워크트리·계획 승인 → 5단계에서 이 스킬 진입.
2. Phase 0: `_workspace/` 없음, 초기 실행.
3. Phase 1: PR #179 미머지 확인, PR #219 상태 기록, `decisions.md` 작성.
4. Phase 2: executor `deps`가 패치 키 2줄을 임시로 지우고 `expo install`, `--fix`, 수동 정렬, `useIsFocused` 소스 이관을 마친다. typecheck 통과. QA M1 통과.
5. Phase 3: 패치 담당과 executor `code-docs`를 병렬 호출. 패치 담당은 webview를 13.16.1로 깨끗이 재타깃하고, expo-constants는 57.x로 재타깃하고, messaging은 유지한다. executor는 테스트 6개, eas.json, 고정 테스트 2개, touchpoints 4절의 문서를 고친다.
6. Phase 4: M2·M3·M4가 순서대로 통과하고 M5에서 CI와 같은 명령이 모두 통과한다.
7. Phase 5: 사용자가 로컬 Dev Client 두 개를 빌드해 D1~D7을 통과시키고, staging 빌드로 D8·D9를 확인한다.
8. Phase 6: `06_leader_summary.md`와 커밋 계획 표를 제시하고 승인을 기다린다.
9. 예상 결과: `apps/mobile/package.json`이 `expo ~57.0.26`·`react-native 0.86.3`, `patches/`에 `react-native-webview@13.16.1.patch`·`expo-constants@57.x.x.patch`·`@react-native-firebase__messaging@26.3.3.patch`, `@react-navigation` 참조 0건, eas.json 이미지 고정 없음.

### 에러 흐름

1. Phase 3에서 webview 패치의 제스처 hunk가 13.16.1에 깨끗이 적용되지 않는다(`RNCWebViewImpl.m` 주변 코드 변경).
2. 패치 담당이 업스트림 diff로 "제스처 차단 미해결, 주변 코드만 변경"을 판정하고 hunk를 손으로 다시 적용한다.
3. QA M2가 `+` 줄의 `RNCDisableForwardNavigationGesture(_webView);`가 1회뿐인 것을 찾아 실패를 낸다. prop 변경 지점 호출이 빠졌다.
4. 리더가 패치 담당을 QA 보고서와 함께 재호출한다. 패치 담당이 두 번째 호출 지점을 되살린다.
5. QA M2 재검증 통과. 설치본 grep에서도 2회 확인.
6. Phase 5의 D7에서 사용자가 스위치를 껐다 켠 뒤에도 앞으로가기가 막혀 있음을 확인한다.
7. 요약에 "webview 제스처 hunk 수동 이관, QA 1회 재검증"을 남긴다.

## 트리거 검증 목록

Should-trigger: "Expo SDK 57로 올리자", "BY-762 작업 시작", "SDK 업그레이드 이어서 해줘", "RN 0.86 업그레이드 진행", "웹뷰 패치만 다시 재타깃해줘", "업그레이드 QA만 다시 돌려", "실기기 확인 끝났어 결과 반영해줘", "eas.json 이미지 고정 다시 확인해줘", "SDK 올린 김에 문서 번호 업데이트", "BY-805 mock 이관 수정", "이전 결과 기반으로 업그레이드 보완".
Should-NOT-trigger: "SDK 58 베타 써볼까?"(범위 밖), "NativeTabs로 탭 바꾸자"(BY-770), "NativeWind v5 마이그레이션"(결정상 제외), "Expo SDK 57에서 바뀐 게 뭐야?"(단순 질문), "react-native-webview 흰 줄 다시 생겼어 원인 찾아줘"(디버깅, 업그레이드 작업이 아닐 때), "웹 React Router 버전 올려줘"(웹 의존성), "EAS production 빌드 올려줘"(릴리즈 절차), "expo-haptics 햅틱 기능 추가"(BY-697 기능 작업), "Firebase 26.4로 올려줘"(결정 변경 요청이라 먼저 사용자와 결정표를 다시 논의).
