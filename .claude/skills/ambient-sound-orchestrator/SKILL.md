---
name: ambient-sound-orchestrator
description: "FocusMakers 백색소음·배경음·앰비언트 사운드·lofi 기능의 구현 하네스 오케스트레이터. 수행계획(docs/superpowers/specs/2026-09-20-BY-682-ambient-sound-design.md)을 기준으로 스파이크 확인 → 음원 수급(sound-asset-curator)과 구현(ambient-sound-implementer) 병렬 → 모듈별 점진 QA(ambient-sound-qa) → 통합 보고까지 조율한다. '백색소음 구현', '배경음 작업 시작', '사운드 기능 만들어줘', '소리 기능 이어서', '스파이크 결과 반영', '음원 교체', '배경음 QA만 다시', '이전 결과 기반으로 보완', '재실행', '업데이트', '수정' 등 배경음 기능의 착수·후속·부분 재실행 요청에 반드시 이 스킬을 사용할 것. 세션 알림음·햅틱·푸시 알림은 이 하네스 범위가 아니다. Jira 티켓·브랜치·PR 절차는 task-workflow 스킬이 감싸고, 이 스킬은 그 5단계(작업 실행) 안에서 돈다."
---

# Ambient Sound Orchestrator

배경음 기능을 계획대로 만들기 위해 세 전문 에이전트를 조율한다. 계획 자체는 `docs/superpowers/specs/2026-09-20-BY-682-ambient-sound-design.md`에 있고, 이 스킬은 그 계획의 티켓을 실행한다.

## 실행 모드: 서브 에이전트

에이전트 팀이 기본값이지만 이 하네스는 서브 에이전트 모드로 돈다. 이유 두 가지:
1. 이 환경에 팀 도구(`TeamCreate`·`TaskCreate`)가 없다. 있는 도구는 `Agent`·`SendMessage`뿐이다.
2. 에이전트 간 계약이 파일 하나(`01_catalog_contract.json`)로 고정되므로 실시간 토론이 필요 없다. 결과는 파일로 넘기고 리더(이 세션)가 통합한다.

팀 도구가 생기면 Phase 3의 두 에이전트를 팀으로 바꾸고 아래 통신 규칙을 SendMessage로 옮긴다.

## 에이전트 구성

| 에이전트 | subagent_type | model | 역할 | 스킬 | 출력 |
|---|---|---|---|---|---|
| ambient-sound-implementer | general-purpose | opus | 웹 재생 모듈·UI·네이티브 프롭 | ambient-sound-playback, focusmakers-design(frontend 저장소) | `_workspace/03_implementer_report.md` + 코드 |
| sound-asset-curator | general-purpose | opus | 음원 수급·루프 인코딩·라이선스 | sound-asset-pipeline | `_workspace/03_curator_report.md` + `public/sounds/*` |
| ambient-sound-qa | general-purpose | opus | 경계면 교차 검증·테스트 실행 | (에이전트 정의에 인라인) | `_workspace/04_qa_report.md` |

에이전트 정의는 이 저장소의 `.claude/agents/{이름}.md`다. Agent 도구 호출 시 prompt 첫 줄에 "당신의 정의는 `<절대경로>/.claude/agents/{이름}.md`다. 먼저 읽어라"를 넣고, `model: "opus"`를 명시한다.

## 경로
저장소 루트(이 파일이 든 `.claude/`의 부모)를 기준으로 적는다. 기계마다 다른 절대경로는 문서에 두지 않는다.
- 프로젝트 루트: `<저장소 루트의 부모>` (frontend 워크트리들이 형제 폴더로 놓인다)
- 작업 디렉토리: `<저장소 루트의 부모>/reports/ambient-sound/_workspace/` (git 밖에 두어 중간 산출물이 커밋되지 않는다)
- 코드 워크트리: `<저장소 루트>` (task-workflow가 `<저장소 루트의 부모>/frontend-BY-N/`으로 만든다). 에이전트 프롬프트에는 실행 시점에 확인한 절대경로로 준다.

## 워크플로우

### Phase 0: 컨텍스트 확인
1. `_workspace/`가 없으면 **초기 실행** → Phase 1.
2. `_workspace/`가 있고 사용자가 부분 수정을 요청하면 **부분 재실행** → 해당 에이전트만 재호출. 프롬프트에 이전 보고서 경로를 넣는다.
3. `_workspace/`가 있고 새 입력(새 카탈로그, 새 시안)이 오면 `_workspace_{YYYYMMDD_HHMMSS}/`로 옮기고 **새 실행**.

### Phase 1: 준비 (리더 직접)
1. 수행계획의 §0 결정표에서 미승인 항목이 있으면 사용자에게 항목별로 묻고 멈춘다. 승인 없는 결정은 코드로 만들지 않는다.
2. 워크트리·티켓이 없으면 `task-workflow` 스킬의 1~4단계로 돌아간다(이 스킬은 5단계 안에서 돈다).
3. `_workspace/00_input/`에 수행계획 사본·승인된 결정표·시안 링크를 둔다.
4. `_workspace/01_catalog_contract.json`을 수행계획 §3 카탈로그로 만든다.

### Phase 2: 스파이크 결과 확인 (리더 직접)
`_workspace/02_spike_results.md`가 없으면 `ambient-sound-playback/references/webview-audio-constraints.md`의 스파이크 표를 사용자에게 안내서로 제시하고 **여기서 멈춘다**. 실기기는 사용자만 만질 수 있다. 결과가 오면 실패 항목과 대안을 결정표에 반영한다.

### Phase 3: 병렬 실행 (서브 에이전트)
단일 메시지에서 두 Agent를 `run_in_background: true`로 동시에 호출한다.

| 에이전트 | 입력 | 출력 |
|---|---|---|
| ambient-sound-implementer | 수행계획, `02_spike_results.md`, `01_catalog_contract.json`, 워크트리 경로, 대상 티켓 범위 | 코드 + `03_implementer_report.md` |
| sound-asset-curator | `01_catalog_contract.json`, 승인된 소리 목록 | 후보 표(`01_asset_candidates.md`) → 사용자 승인 → 파일 + `03_curator_report.md` |

큐레이터는 후보 표를 낸 시점에 한 번 멈춘다. 리더는 사용자 승인을 받아 SendMessage로 이어서 진행시킨다. 구현자는 합성 노이즈부터 만들므로 에셋을 기다리지 않는다.

**점진 QA:** 구현자 보고서에 "모듈 완료" 표시가 생길 때마다(재생 코어 → 세션 연동 → UI) `ambient-sound-qa`를 호출한다. 전체가 끝난 뒤 한 번만 하지 않는다. 경계면 결함은 늦게 잡을수록 되돌릴 코드가 많다.

### Phase 4: 통합 (리더 직접)
1. 세 보고서를 읽는다. QA 실패 항목은 해당 에이전트를 재호출해 고친다(1회). 재실패면 미완으로 남기고 보고한다.
2. `pnpm --filter web lint && pnpm --filter web typecheck`를 리더가 한 번 더 돌린다. 전체 vitest는 에이전트가 모두 끝난 뒤에만 돌린다.
3. 결과 요약을 `_workspace/05_summary.md`에 쓰고, task-workflow 6단계(도식화·요약 제출)로 넘긴다. 커밋은 사용자 승인 뒤에만 한다.

### Phase 5: 정리
`_workspace/`는 지우지 않는다. 사용자에게 "결과에서 고칠 부분이 있는지, 에이전트 구성에서 바꿀 점이 있는지" 한 번 묻고, 피드백은 CLAUDE.md 변경 이력에 남긴다.

## 데이터 흐름
```
수행계획 + 결정표 ──► 00_input/ ──► 01_catalog_contract.json
                                   │
사용자 실기기 ──► 02_spike_results.md
                                   │
              ┌────────────────────┴───────────────────┐
   implementer (코드 + 03_implementer_report)   curator (sounds/* + 03_curator_report)
              └────────────────────┬───────────────────┘
                              qa (04_qa_report, 모듈마다)
                                   │
                         리더 통합 → 05_summary.md → task-workflow 6단계
```

## 에러 핸들링
| 상황 | 전략 |
|---|---|
| 에이전트 1개 실패 | 같은 프롬프트에 실패 원인을 붙여 1회 재시도. 재실패면 그 영역을 "미완"으로 보고서에 적고 진행 |
| 스파이크 S2(iOS 출력 경로) 실패 | iOS를 범위에서 빼고 Android 우선으로 결정표를 고쳐 사용자 승인 |
| 허용 라이선스 음원 미수급 | 합성 노이즈만으로 V1 출시. 파일 항목은 카탈로그에서 뺀다 |
| 카탈로그 계약 불일치 | 계약 파일이 진실. 양쪽 에이전트에 계약 경로를 다시 주고 맞춘다 |
| 전체 vitest 경합 타임아웃 | 에이전트 동시 실행 중 전체 스위트 금지. 단일 파일만 |
| 사용자 승인 대기 | 승인 필요한 지점(결정표·음원 다운로드·커밋)에서는 멈추고 묻는다. 임의 진행하지 않는다 |

## 테스트 시나리오

### 정상 흐름
1. 사용자: "백색소음 기능 구현 시작해줘" → task-workflow 1~4단계로 티켓·워크트리·계획 승인.
2. Phase 1에서 결정표 D1~D8 승인 확인, 계약 파일 생성.
3. Phase 2에서 `02_spike_results.md` 존재 확인(S1~S6 통과).
4. Phase 3에서 구현자·큐레이터 병렬 호출. 큐레이터 후보 표 승인 후 빗소리·카페 2종 인코딩. 구현자는 재생 코어 → 세션 연동 → UI 순으로 진행, 모듈마다 QA 호출.
5. Phase 4에서 lint·typecheck·전체 테스트 통과, `05_summary.md` 작성.
6. 예상 결과: 워크트리에 `features/ambient-sound/` 모듈·테스트, `public/sounds/` 파일 3개(catalog.json, LICENSES.md, 2 mp3), `RemoteWebViewHost.tsx` 프롭 1개.

### 에러 흐름
1. Phase 3에서 큐레이터가 허용 라이선스 카페 소리를 못 찾음.
2. 리더가 결정표를 "V1 파일 항목: 빗소리 1종"으로 고쳐 사용자 승인.
3. 계약 파일에서 `cafe` 제거 → 구현자에게 SendMessage로 계약 변경 알림.
4. QA가 카탈로그↔파일 1:1을 재검증.
5. 보고서에 "카페 소리 미수급, V2 후보" 명시.

## 트리거 검증 목록
Should-trigger: "백색소음 구현 시작", "배경음 기능 만들어줘", "lofi 넣고 싶은데 작업하자", "빗소리 음원 교체해줘", "배경음 QA만 다시 돌려", "스파이크 결과 나왔어 반영해줘", "소리 기능 이전 결과 기반으로 보완", "앰비언트 사운드 시트 UI 수정", "사운드 설정 저장 방식 업데이트", "노이즈 합성 코드 리뷰해줘".
Should-NOT-trigger: "세션 자동 종료 때 알림음 넣어줘"(알림 정책, 범위 밖), "카메라 셔터음 꺼줘"(카메라), "소셜룸에 마이크 음성 채팅 추가"(WebRTC 오디오, 별도 설계), "햅틱 피드백 추가"(햅틱), "Amplitude에 사운드 이벤트 대시보드 만들어줘"(분석 대시보드), "타임랩스 영상에 BGM 입혀줘"(타임랩스 기능), "앱 스토어 소개글에 백색소음 문구 추가"(ASO), "백색소음이 뭐야?"(단순 질문).
