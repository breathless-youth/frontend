/**
 * 시스템 일시정지 신호원 — 화면 꺼짐 / 앱 백그라운드 전환을 감지하는 **어댑터 한 곳**.
 *
 * 2026-07-26 6차 인터뷰 확정: 화면 꺼짐·백그라운드는 별도 "비집중" 유형이 아니라
 * **일시정지에 합산**된다. 트리거만 다르고(`PauseTrigger`) 상태·화면·시간 처리·서버 전송은
 * 수동 일시정지와 완전히 동일하다 — 그래서 이 어댑터는 "언제 일시정지에 들어가는가"만
 * 알려주고, 그 뒤는 `useStudyRoomSession.pause("BACKGROUND")`라는 **같은 한 통로**로 들어간다.
 *
 * ⚠️ 웹(WebView) 표준은 Page Visibility API(`visibilitychange`) + `pagehide`지만,
 * **WKWebView에서 화면 잠금 시 이 이벤트가 실제로 발화하는지는 실기기 검증 전까지 확정 불가**다.
 * 그래서 감지 수단을 이 파일 하나로 격리한다 — 네이티브 브리지가 필요해지면 여기만 교체한다
 * (UI·훅·상태 머신은 손대지 않는다).
 */

export interface SystemPauseSource {
  /**
   * 구독. `onLeave`는 화면이 가려질 때, `onReturn`은 다시 보일 때 호출된다.
   * 반환값은 구독 해제 함수.
   */
  subscribe(handlers: SystemPauseHandlers): () => void;
}

export interface SystemPauseHandlers {
  /** 화면 꺼짐·백그라운드 전환 — 일시정지에 진입한다. */
  readonly onLeave: () => void;
  /**
   * 복귀 — **재개 방식(자동/수동)이 미확정**이라 훅에서 no-op으로 받는다.
   * 자세한 경위는 `useStudyRoomSession.onReturnFromBackground` 주석 참고.
   */
  readonly onReturn: () => void;
}

/**
 * 브라우저/WebView 구현. 이건 SDK 설치가 필요 없는 **표준 DOM 이벤트**라 어댑터 뒤의
 * 실제 구현을 지금 넣어도 "검증되지 않은 네이티브 라이브러리 설치" 금지 규칙에 걸리지 않는다.
 */
export function createSystemPauseSource(target: Document = document): SystemPauseSource {
  return {
    subscribe({ onLeave, onReturn }) {
      const handleVisibilityChange = () => {
        if (target.visibilityState === "hidden") {
          onLeave();
          return;
        }
        onReturn();
      };
      // iOS Safari/WKWebView는 상황에 따라 visibilitychange 없이 pagehide만 발화할 수 있다.
      // 중복 호출은 안전하다 — 이미 PAUSE면 `transition`이 같은 상태로 다시 끊지 않는다.
      const handlePageHide = () => {
        onLeave();
      };
      // pagehide 전용 경로의 복귀 짝 — 이게 없으면 그 경로에서 onReturn이 영영 오지 않아
      // 복귀 시점 재계산(자동 종료·유예 만료 판정)이 통째로 빠진다. 중복 호출은 안전하다.
      const handlePageShow = () => {
        onReturn();
      };

      target.addEventListener("visibilitychange", handleVisibilityChange);
      target.defaultView?.addEventListener("pagehide", handlePageHide);
      target.defaultView?.addEventListener("pageshow", handlePageShow);
      return () => {
        target.removeEventListener("visibilitychange", handleVisibilityChange);
        target.defaultView?.removeEventListener("pagehide", handlePageHide);
        target.defaultView?.removeEventListener("pageshow", handlePageShow);
      };
    },
  };
}

/** 테스트·스토리에서 시스템 신호를 수동으로 밀어넣는 mock. */
export interface MockSystemPauseSource extends SystemPauseSource {
  leave(): void;
  return(): void;
}

export function createMockSystemPauseSource(): MockSystemPauseSource {
  const subscribers = new Set<SystemPauseHandlers>();
  return {
    subscribe(handlers) {
      subscribers.add(handlers);
      return () => {
        subscribers.delete(handlers);
      };
    },
    leave() {
      for (const handlers of subscribers) {
        handlers.onLeave();
      }
    },
    return() {
      for (const handlers of subscribers) {
        handlers.onReturn();
      }
    },
  };
}
