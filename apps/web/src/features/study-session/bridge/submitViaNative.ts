import type { StudySessionCreateRequest, StudySessionResponse } from "@focuson/types";

import { postToNative, subscribeToNativeMessages } from "@/lib/bridge";

/**
 * 세션 제출을 **네이티브에 대행시킨다** — WebView 안에서 백엔드로 직접 `fetch`하면 CORS에
 * 막히기 때문이다(백엔드가 `Access-Control-Allow-Origin`을 보내지 않는다, 2026-07-30 확인).
 * 네이티브의 `fetch`는 브라우저 CORS 정책을 타지 않으므로 같은 요청이 그대로 통한다.
 *
 * **여기에 계약 로직을 두지 않는다.** 요청 본문은 호출부(`submitStudySession`)가 이미
 * `buildSessionRequest`로 완성해서 넘기고, 이 모듈은 왕복만 책임진다.
 */

/**
 * 응답을 기다리는 상한.
 *
 * **없으면 UI가 영원히 "저장 중..."에 갇힌다.** 브리지는 한 방향으로 던지는 통로라, 상대가
 * `submit-session`을 모르면 아무 응답도 오지 않고 실패조차 발생하지 않는다. 그런 조합이 실제로
 * 가능하다 — 웹은 원격 URL에서 오고(`extra.webBaseUrl`) 앱은 스토어 빌드라, 웹 배포가 설치된
 * 앱보다 앞서는 것이 오히려 기본 상태다. 직접 `fetch`하는 경로에는 이 위험이 없어서 상한이 없다.
 *
 * ⚠️ **넉넉하게 잡은 이유가 있다. 짧게 줄이지 말 것.** 상한을 넘겨도 요청 자체는 이미 서버에
 * 도착했을 수 있는데, 그때 사용자가 재시도 버튼을 누르면 **같은 세션이 두 번 저장된다**
 * (제출 API에 멱등 키가 없다). 즉 짧은 상한의 대가는 "조금 더 빨리 에러를 본다"가 아니라
 * **중복 데이터**다. 반대로 길게 잡는 대가는 실패 화면이 늦게 뜨는 것뿐이다.
 */
export const NATIVE_SUBMIT_TIMEOUT_MS = 30_000;

export const NATIVE_SUBMIT_TIMEOUT_MESSAGE =
  "앱이 응답하지 않아 저장하지 못했습니다. 잠시 후 다시 시도해주세요.";

/** 요청 식별자. 한 페이지 수명 안에서만 유일하면 되므로 카운터로 충분하다. */
let sequence = 0;

export interface SubmitViaNativeOptions {
  /** 테스트가 짧은 값을 주입한다. */
  readonly timeoutMs?: number;
}

export function submitViaNative(
  request: StudySessionCreateRequest,
  options: SubmitViaNativeOptions = {},
): Promise<StudySessionResponse[]> {
  const timeoutMs = options.timeoutMs ?? NATIVE_SUBMIT_TIMEOUT_MS;
  sequence += 1;
  const requestId = `submit-${String(sequence)}`;

  return new Promise<StudySessionResponse[]>((resolve, reject) => {
    /**
     * 구독 해제와 타이머 정리를 한곳에 모은다 — 성공·실패·타임아웃 세 경로 모두 반드시
     * 지나야 한다. 빠뜨리면 끝난 요청의 핸들러가 남아 다음 제출 결과까지 받는다.
     */
    let settled = false;
    const finish = (run: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      run();
    };

    const unsubscribe = subscribeToNativeMessages((message) => {
      if (message.type !== "submit-result") {
        return;
      }
      // 내 요청의 응답만 받는다 — 재시도 중 첫 요청의 늦은 응답으로 완료되면 사용자에게
      // 낡은 결과가 보인다(`packages/types`의 `SubmitResultMessage` 주석).
      if (message.requestId !== requestId) {
        return;
      }
      finish(() => {
        if (message.ok) {
          resolve(message.sessions);
        } else {
          reject(new Error(message.message));
        }
      });
    });

    const timer = setTimeout(() => {
      finish(() => reject(new Error(NATIVE_SUBMIT_TIMEOUT_MESSAGE)));
    }, timeoutMs);

    postToNative({ type: "submit-session", requestId, request, atMs: Date.now() });
  });
}
