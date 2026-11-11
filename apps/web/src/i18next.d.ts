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
import type settings from "./locales/ko/settings.json";
import type profile from "./locales/ko/profile.json";
import type appLock from "./locales/ko/app-lock.json";
import type ambientSound from "./locales/ko/ambient-sound.json";
import type forceUpdate from "./locales/ko/force-update.json";
import type measurementFeedback from "./locales/ko/measurement-feedback.json";
import type onboarding from "./locales/ko/onboarding.json";
import type home from "./locales/ko/home.json";
import type liveRoom from "./locales/ko/live-room.json";
import type socialRoom from "./locales/ko/social-room.json";
import type studySession from "./locales/ko/study-session.json";
import type groupRoom from "./locales/ko/group-room.json";
import type login from "./locales/ko/login.json";
import type points from "./locales/ko/points.json";
import type pointsShop from "./locales/ko/points-shop.json";
import type pointsEarn from "./locales/ko/points-earn.json";
import type pointsItems from "./locales/ko/points-items.json";
import type pointsDecor from "./locales/ko/points-decor.json";
import type pointsMascots from "./locales/ko/points-mascots.json";
import type pointsResult from "./locales/ko/points-result.json";

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
      settings: typeof settings;
      profile: typeof profile;
      "app-lock": typeof appLock;
      "ambient-sound": typeof ambientSound;
      "force-update": typeof forceUpdate;
      "measurement-feedback": typeof measurementFeedback;
      onboarding: typeof onboarding;
      home: typeof home;
      "live-room": typeof liveRoom;
      "social-room": typeof socialRoom;
      "study-session": typeof studySession;
      "group-room": typeof groupRoom;
      login: typeof login;
      points: typeof points;
      "points-shop": typeof pointsShop;
      "points-earn": typeof pointsEarn;
      "points-items": typeof pointsItems;
      "points-decor": typeof pointsDecor;
      "points-mascots": typeof pointsMascots;
      "points-result": typeof pointsResult;
    };
  }
}
