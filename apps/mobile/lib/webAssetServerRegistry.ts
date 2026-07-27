import type { WebAssetServer } from "./webAssetServer";
import { createFakeWebAssetServer } from "./webAssetServer";

/**
 * 앱 전체가 공유하는 로컬 웹 자산 서버 하나.
 *
 * 서버는 프로세스당 하나만 떠야 하므로(포트를 잡는다) 화면이 각자 만들지 않고 여기서 받아간다.
 * 기본값이 fake인 것은 **실제 구현이 아직 없기 때문**이다 — S1 스파이크에서 라이브러리를
 * 정한 뒤 이 파일의 기본값만 실제 구현으로 바꾼다(라우트·테스트는 손대지 않는다).
 */
let current: WebAssetServer = createFakeWebAssetServer();

export function getWebAssetServer(): WebAssetServer {
  return current;
}

/** 테스트·스파이크 주입점. */
export function setWebAssetServer(server: WebAssetServer): void {
  current = server;
}

export function resetWebAssetServer(): void {
  current = createFakeWebAssetServer();
}
