import "i18next";

import type common from "./locales/ko/common.json";
import type records from "./locales/ko/records.json";
import type ranking from "./locales/ko/ranking.json";
import type planner from "./locales/ko/planner.json";
import type manualRecord from "./locales/ko/manual-record.json";
import type multiTimer from "./locales/ko/multi-timer.json";
import type timelapse from "./locales/ko/timelapse.json";
import type notice from "./locales/ko/notice.json";
import type interview from "./locales/ko/interview.json";

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
      records: typeof records;
      ranking: typeof ranking;
      planner: typeof planner;
      "manual-record": typeof manualRecord;
      "multi-timer": typeof multiTimer;
      timelapse: typeof timelapse;
      notice: typeof notice;
      interview: typeof interview;
    };
  }
}
