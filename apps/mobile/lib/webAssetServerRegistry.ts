import { createStaticWebAssetServer } from "./staticWebAssetServer";
import type { WebAssetServer } from "./webAssetServer";
import { createUnavailableWebAssetServer } from "./webAssetServer";

/**
 * 앱 전체가 공유하는 로컬 웹 자산 서버 하나.
 *
 * 서버는 프로세스당 하나만 떠야 하므로(포트를 잡는다) 화면이 각자 만들지 않고 여기서 받아간다.
 * 기본값은 실제 구현(`createStaticWebAssetServer`)이다 — S1 스파이크에서 라이브러리를
 * 정했으므로 이 파일이 그 결과를 앱에 꽂는 유일한 지점이고, 라우트·테스트는 손대지 않았다.
 *
 * 생성 시점에는 네이티브를 건드리지 않는다(`staticWebAssetServer.ts`의 지연 로딩 주석 참고).
 * 그래서 이 기본값이 앱 시작 시 만들어져도 네이티브가 없는 환경에서 앱이 죽지 않고,
 * 실패는 "집중 시작" 시점의 거부로 나타난다.
 */
let current: WebAssetServer = createStaticWebAssetServer();

export function getWebAssetServer(): WebAssetServer {
  return current;
}

/** 테스트·스파이크 주입점. */
export function setWebAssetServer(server: WebAssetServer): void {
  current = server;
}

/**
 * 주입을 걷어내고 **사용 불가** 서버로 되돌린다 — 테스트 간 격리용이며, 테스트 전용이다.
 *
 * 앱 기본값(실제 구현)으로 되돌리지 않는 것은 의도다. 실제 구현은 네이티브 서버를 띄우므로
 * 테스트가 주입을 깜빡하면 진짜 포트를 잡으려 들고, 그 실패 메시지는 원인과 한참 떨어져 있다.
 * fake로 되돌리지도 않는다 — fake는 `start()`가 성공해서 "주입을 깜빡한 테스트"가
 * 통과해버린다. 사용 불가가 깜빡임을 그 자리에서 드러낸다.
 */
export function resetWebAssetServer(): void {
  current = createUnavailableWebAssetServer();
}
