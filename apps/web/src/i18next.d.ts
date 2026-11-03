import "i18next";

import type common from "./locales/ko/common.json";

/**
 * 카탈로그 키 타입
 *
 * 한국어 카탈로그를 기준으로 키를 선언해 오타를 typecheck에서 잡는다.
 * 새 네임스페이스를 만들면 이 resources에 한 줄을 더한다.
 */
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: {
      common: typeof common;
    };
  }
}
