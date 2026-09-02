import type {
  StudySessionResponse,
  SubmitResultMessage,
  SubmitSessionMessage,
} from "@focusmakers/types";

import { apiFetch, parseErrorMessage } from "./api";
import { apiBaseUrl } from "./apiBaseUrl";

/**
 * 웹이 부탁한 세션 제출을 **네이티브가 대행한다.**
 *
 * WebView 안에서 백엔드로 직접 `fetch`하면 CORS에 막힌다 — 백엔드가
 * `Access-Control-Allow-Origin`을 보내지 않는다(2026-07-30 확인). 네이티브의 `fetch`는 브라우저
 * CORS 정책을 타지 않으므로 같은 요청이 그대로 통한다(`lib/userApi.ts`가 같은 백엔드를 이미
 * 이렇게 호출하고 있다).
 *
 * 로컬 정적 서버에 `/api` 리버스 프록시를 두는 방법은 쓸 수 없다 —
 * `@dr.pogodin/react-native-static-server`가 임베드한 lighttpd는 정적 빌드이고 `mod_proxy`가
 * 컴파일 목록에 없다. 없는 모듈을 `server.modules`에 넣으면 서버가 기동조차 하지 않는다.
 *
 * ⚠️ **여기에 세션 로직을 두지 않는다.** 시각 변환·클램프 등 계약 검증은 웹의
 * `buildSessionRequest`가 소유하고, 이 함수는 받은 본문을 **고치지 않고** 그대로 POST한다
 * (루트 `CLAUDE.md` 아키텍처 경계). 그래서 인자가 `request` 객체 하나다 — 조립할 것이 없다.
 */
/**
 * 제출을 대행하고 **웹에 돌려줄 메시지를 만든다.**
 *
 * 던지지 않는다 — 실패도 `ok: false` 메시지로 바꿔 돌려준다. 여기서 예외가 새면 호출부
 * (`onMessage` 핸들러)가 응답을 못 보내고, 그러면 웹은 타임아웃까지 "저장 중..."에 갇힌다.
 * 실패 사유는 사용자에게 그대로 보이므로(웹의 재시도 화면) 서버 `message`를 살려 전달한다.
 */
export async function relaySessionSubmit(
  message: SubmitSessionMessage,
): Promise<SubmitResultMessage> {
  try {
    const res = await apiFetch(`${apiBaseUrl()}/api/study-sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message.request),
    });
    if (!res.ok) {
      const error = await parseErrorMessage(res, "세션 제출 실패");
      return {
        type: "submit-result",
        requestId: message.requestId,
        ok: false,
        message: error.message,
        status: res.status,
        atMs: Date.now(),
      };
    }
    const sessions = (await res.json()) as StudySessionResponse[];
    return {
      type: "submit-result",
      requestId: message.requestId,
      ok: true,
      sessions,
      atMs: Date.now(),
    };
  } catch (error: unknown) {
    return {
      type: "submit-result",
      requestId: message.requestId,
      ok: false,
      message: error instanceof Error ? error.message : "세션 제출에 실패했습니다",
      atMs: Date.now(),
    };
  }
}
