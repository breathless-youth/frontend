---
name: i18n-orchestrator
description: "FocusMakers 국제화(BY-731, 영어 지원) 하네스 오케스트레이터. 기반 구축(i18n-infra-builder) → 묶음별 문구 추출(string-migrator) → 영어 카탈로그(en-copywriter) → 사용자 영어 검토 → 모바일 셸·스토어 메타 → 마지막 묶음 → 모듈별 점진 QA(i18n-qa) → 실기기 게이트까지 조율한다. '국제화 진행', 'i18n 작업', '영어 지원', 'BY-731', 'BY-808·809·810·811·812', '문구 추출 이어서', '묶음 A만', '영어 번역 다시', '영어 검토 결과 반영해줘', '셸 언어 작업', '스토어 영어 메타', 'QA만 다시', '이전 결과 기반으로 보완', '재실행', '다시', '업데이트', '수정', '보완' 등 국제화의 착수·후속·부분 재실행 요청에 반드시 이 스킬을 사용할 것. 약관 영어판(BY-1117), 앱 안 언어 선택(BY-813), 시간대 전환(BY-814·815), 단순 번역 질문은 이 하네스 범위가 아니다. Jira·브랜치·PR 절차는 task-workflow가 감싸고, 이 스킬은 그 5단계 안에서 돈다."
---

# i18n Orchestrator

국제화(BY-731)를 네 전문 에이전트로 나눠 실행한다. Jira·브랜치·PR은 `task-workflow`가 맡고, 이 스킬은 그 5단계(작업 실행) 안에서 돈다. 설계는 `docs/superpowers/specs/2026-10-01-BY-731-i18n-design.md`다.

| 하위 티켓 | 내용 | 담당 |
|---|---|---|
| BY-808 | 웹 런타임·로케일·intl·common·린트 골격 | i18n-infra-builder (`web-foundation`) |
| BY-809 | 웹 문구 추출 묶음 A·B·C | string-migrator |
| BY-810 | 영어 카탈로그·표기 규칙·사용자 검토 | en-copywriter + 사용자 |
| BY-811 | 모바일 셸·Android 리소스·스토어 메타 | i18n-infra-builder (`mobile-shell`) |
| BY-812 | 실기기 검증 | 사용자 |

## 실행 모드: 서브 에이전트

이 환경에는 팀 도구(`TeamCreate`·`TaskCreate`)가 없다. 에이전트끼리 주고받는 것은 보고서 파일이고 실시간 토론이 필요 없어 리더(이 세션)가 파일을 읽어 다음 에이전트에 넘긴다. 구조는 파이프라인이고, 묶음 A·B 추출만 팬아웃으로 병렬이다. QA는 모듈이 끝날 때마다 붙는 생성-검증 쌍이다.

## 에이전트 구성

| 에이전트 | subagent_type | model | 스킬 | 출력 |
|---|---|---|---|---|
| i18n-infra-builder | general-purpose | opus | i18n-foundation, doc-writing(주석) | `02_infra_web-foundation.md`, `04_infra_mobile-shell.md` |
| string-migrator | general-purpose | opus | string-migration | `03_migrator_batch-{A,B,C}.md` |
| en-copywriter | general-purpose | opus | string-migration/references/en-style.md | `03_copywriter_batch-{X}.md` |
| i18n-qa | general-purpose | opus | (에이전트 정의에 인라인) | `0N_qa_{모듈}.md` |

Agent 호출 prompt 첫 줄에 "당신의 정의는 `<저장소 루트 절대경로>/.claude/agents/{이름}.md`다. 먼저 읽어라"를 넣고, `model: "opus"`를 명시한다. 코드 에이전트의 effort는 high다.

## 경로

- 코드 워크트리: `<저장소 루트>`, 브랜치 `feature/BY-731-i18n`.
- 작업 디렉토리: `<저장소 루트의 부모>/reports/i18n/_workspace/`. git 밖이다.
- 파일명: `{phase}_{agent}_{artifact}.md`. agent는 `infra`, `migrator`, `copywriter`, `qa`, `leader`, `user` 중 하나다.

## 워크플로우

### Phase 0: 컨텍스트 확인

1. `_workspace/`에 `01_leader_*`가 없으면 **초기 실행**이다.
2. 있고 사용자가 일부만 원하면 **부분 재실행**이다.
   - "묶음 A만 다시" → string-migrator `batch-A` 또는 `fix`, 이어서 QA `M2-A`.
   - "영어 검토 결과 반영" → en-copywriter에 사용자 검토 결과 경로를 넘기고, 이어서 QA 해당 모듈.
   - "QA만 다시" → i18n-qa에 지정 모듈.
3. dev 기준이 바뀌어 다시 받았으면 `_workspace/01_leader_status.md`에 새 기준 커밋을 적고, 영향받는 묶음만 다시 돈다. 폴더 이름은 바꾸지 않는다(묶음 단위로 이어지는 작업이라 이전 보고서가 계속 쓸모 있다).
4. 가장 최근 `01_leader_status.md`를 읽고 어디까지 왔는지 사용자에게 한 줄로 알린다.

### Phase 1: 준비 (리더 직접)

1. 워크트리·브랜치를 확인하고 `origin/dev`와의 차이를 본다.
2. `.ai` 위키 최신을 `git -C .ai fetch origin` 뒤 `git show origin/main:<파일>`로 읽어 `_workspace/00_input/wiki/`에 사본을 둔다(`product/voice-tone.md`, `project/glossary.md`). 서브모듈 포인터는 움직이지 않는다.
3. `_workspace/00_input/decisions.md`: 설계서 결정표 사본과 이번 실행에서 더한 결정.
4. `_workspace/01_leader_status.md`: 기준 커밋, 단계별 상태 표.
5. 결정표 밖 판단이 필요하면 여기서 사용자에게 묻는다. 이미 승인된 결정은 다시 묻지 않는다.

### Phase 2: 기반 (BY-808, 순차)

`writing-plans`로 쓴 BY-808 계획서(`docs/superpowers/plans/`)를 넘겨 i18n-infra-builder `web-foundation`을 부르고 끝날 때까지 기다린다. 끝나면 QA `M1`. **M1이 통과해야 Phase 3으로 간다.** 키 규칙과 `t()` 사용법이 정해져야 추출 담당이 같은 방식으로 쓴다.

### Phase 3: 문구 추출 (BY-809, 팬아웃)

1. 한 메시지에서 string-migrator 두 개를 `batch-A`, `batch-B`로 `run_in_background: true`로 부른다. 네임스페이스 목록은 설계서 카탈로그 표에서 묶음별로 넘긴다. 기반 보고서 "사용법" 절 경로를 넘긴다.
2. 두 담당의 "common 요청"을 리더가 모아 `common.json` ko에 한 번에 더한다(en은 영어 담당이 채운다).
3. 묶음마다 en-copywriter를 부른다. 묶음 A가 먼저 끝나면 B를 기다리지 않는다.
4. 영어 담당이 끝난 묶음마다 QA `M2-{X}`.

### Phase 4: 사용자 영어 검토 게이트 (BY-810)

영어 담당 보고서의 검토 표와 용어 정정안을 `_workspace/04_leader_en-review.md`로 모아 사용자에게 보인다. 사용자가 답하기 전에는 en 카탈로그를 확정본으로 다루지 않는다. 다른 단계(Phase 5)는 계속 진행해도 된다. 답이 오면 `04_user_en-review.md`에 적고 en-copywriter를 재호출한 뒤 해당 QA를 다시 돈다.

### Phase 5: 모바일 셸 (BY-811)

i18n-infra-builder `mobile-shell` → QA `M4`. 네이티브 변경이라 11/20 동결 전에 머지돼야 한다.

### Phase 6: 마지막 묶음 (BY-809 C)

home·live-room·social-room·study-session은 다른 레인과 파일이 겹친다. 착수 전에 `origin/dev`를 다시 받고, 시간대(BY-815)·공간 테마(BY-1116)·소셜 로그인 브랜치가 해당 폴더를 머지했는지 확인한다. 끝나면 `I18N_ENFORCED`를 `src/**` 전체로 바꾸고 QA `M5 통합`.

### Phase 7: 실기기 게이트 (BY-812, 사용자)

`_workspace/07_leader_device-checklist.md`를 만들어 보이고 멈춘다. Dev Client 재빌드(사용자), iOS·Android(Note10) 기기 언어 영어·한국어, 홈·세션·결과·기록·랭킹·설정 라이트·다크.

### Phase 8: 요약 (리더 직접)

1. `_workspace/08_leader_summary.md`: 네임스페이스·키 수, 남긴 한글과 이유, QA 판정, 번들 크기 전후, 범위 밖.
2. 커밋 계획을 `task-workflow` 5-2 표로 만든다. 기본안은 하위 티켓·묶음별 커밋이다. **커밋은 사용자 승인 뒤에만, 푸시는 별도 승인 뒤에만 한다.**
3. 하네스를 고쳤으면 루트 `CLAUDE.md` 변경 이력에 남긴다.

## 파일 소유 범위

| 영역 | 소유 |
|---|---|
| `lib/i18n.ts`, `lib/locale.ts`, `lib/intl.ts`, `i18next.d.ts`, `index.html`, `main.tsx`, `test/setup.ts`, `locales/__tests__/`, `package.json`·lockfile | i18n-infra-builder |
| `locales/*/common.json` | 기반 담당이 만들고, 이후 리더가 common 요청을 모아 더한다 |
| `features/<폴더>/`, 해당 `routes/*Page.tsx`, `locales/ko/<ns>.json` | 그 묶음의 string-migrator |
| `locales/en/<ns>.json`(자리 표시 이후), `en-style.md` | en-copywriter |
| `eslint.config.mjs`, `src/i18next.d.ts` | 리더. 추출 착수 전에 빈 네임스페이스 JSON과 타입 줄을 만들어 두고, 묶음이 끝나면 보고서 "리더에게" 절을 보고 린트 범위를 더한다 |
| `apps/mobile/**` | i18n-infra-builder (`mobile-shell`) |

## 데이터 흐름

```
설계서·결정표 ──► 00_input/
                    │
        infra(web-foundation) ──► 02_infra_web-foundation.md ──► qa M1
                    │                                            │ 통과
          ┌─────────┴─────────┐ ◄────────────────────────────────┘
   migrator batch-A     migrator batch-B
          │                    │
   copywriter A         copywriter B
          │                    │
       qa M2-A             qa M2-B   (실패 시 생산자 fix → 같은 모듈 재검증, 최대 2회)
          └─────────┬──────────┘
          04_leader_en-review.md ──► 사용자 검토 ──► copywriter 재호출
                    │
        infra(mobile-shell) ──► qa M4
                    │
        migrator batch-C + 린트 전체 ──► copywriter C ──► qa M5 통합
                    │
        07_leader_device-checklist.md ──► 사용자 실기기
                    │
        08_leader_summary.md ──► 커밋 승인 대기
```

## 에러 핸들링

| 상황 | 전략 |
|---|---|
| 에이전트 실패·중단 | 실패 원인을 붙여 1회 재시도한다. 재실패면 그 모듈을 "미완"으로 상태 파일에 적고 다음 독립 단계로 간다 |
| QA 같은 모듈 2회 실패 | 멈추고 실패 내용과 선택지를 사용자에게 보인다 |
| 한국어 출력이 바뀜(기존 테스트 실패) | 생산자 `fix`. 테스트를 고쳐서 맞추지 않는다 |
| 승인되지 않은 의존성이 필요 | 진행하지 않고 사용자에게 묻는다 |
| 전체 테스트 경합 타임아웃 | 다른 에이전트가 끝난 뒤 단독으로 다시 돌린다 |
| dev에서 같은 파일이 바뀜 | 묶음 C처럼 다시 받은 뒤 해당 묶음만 다시 돈다 |
| 사용자 승인 필요 지점 | 결정표 밖 선택, 영어 용어 확정, 커밋, 푸시, 위키 커밋 |

## 테스트 시나리오

### 정상 흐름

1. 사용자: "국제화 진행하자" → task-workflow 1~4단계 → 5단계에서 이 스킬 진입.
2. Phase 0: 초기 실행. Phase 1: 위키 사본·결정표·상태 파일.
3. Phase 2: 기반 담당이 i18next를 설치하고 `locale.ts`·`intl.ts`·`common`·카탈로그 가드를 TDD로 만든다. 기존 웹 테스트가 고치지 않고 통과. QA M1 통과.
4. Phase 3: 묶음 A·B 병렬 추출, 영어 담당이 묶음별로 en을 채움, QA M2-A·M2-B 통과.
5. Phase 4: 검토 표를 사용자에게 보이고, 답을 반영.
6. Phase 5~8: 셸, 묶음 C, 실기기, 요약과 커밋 계획.

### 에러 흐름

1. 묶음 A에서 `recordsFormat.ts`를 `intl.ts`로 바꾸자 기록 탭 테스트가 `오후 9:03`을 기대했는데 `21:03`이 나와 실패한다.
2. 추출 담당이 테스트를 고치지 않고 보고서에 실패를 적는다. QA M2-A가 "한국어 출력 변경"으로 실패를 낸다.
3. 리더가 추출 담당 `fix`를 부른다. 그 표기는 `Intl` 대신 카탈로그 키로 만든다.
4. QA 재검증 통과. 요약에 "ko 시각 표기는 카탈로그 키로 유지"를 남긴다.

## 트리거 검증 목록

Should-trigger: "국제화 작업 이어서 해줘", "BY-808 기반 구축 시작", "기록 탭 문구 카탈로그로 빼줘", "묶음 B만 다시 돌려", "영어 번역 검토 끝났어 반영해줘", "셸 언어 전달 작업하자", "스토어 영어 권한 문구 넣어줘", "i18n QA만 다시", "이전 결과 기반으로 영어 문구 보완", "BY-811 진행".
Should-NOT-trigger: "약관 영어판 만들자"(BY-1117), "설정에 언어 선택 넣자"(BY-813), "하루 경계를 기기 시간대로"(BY-815), "이 문장 영어로 뭐라고 해?"(단순 질문), "Play 스토어 스크린샷 찍어줘"(사용자 작업), "토스트 문구 하나 고쳐줘"(일반 UI 수정, 카탈로그가 이미 있으면 직접 고친다), "Expo SDK 올리자"(다른 하네스), "배경음 추가"(다른 하네스).
