import { getLocales } from "expo-localization";

import { APP_LOCALES, type AppLocale, negotiateLocale } from "@focusmakers/types";

/**
 * 셸 문구 카탈로그
 *
 * 화면은 웹이 그리고 셸이 직접 보이는 문구는 탭·권한 안내·앱 잠금 시트 정도라 라이브러리 없이 언어별 객체로 둔다.
 * 웹 카탈로그와 같은 용어를 쓴다(`apps/web/src/locales/en`).
 * 키를 더하면 네 언어에 함께 넣는다(ko 밖의 객체 타입이 ko 키를 강제한다).
 */
const ko = {
  "tab.home": "홈",
  // 탭 키는 경로 이름을 따른다.
  // 소셜 자리 탭은 경로가 social 그대로이고 보이는 이름만 그룹이다.
  "tab.social": "그룹",
  "tab.records": "기록",
  "tab.ranking": "랭킹",
  "tab.settings": "설정",

  "common.done": "완료",
  "common.back": "뒤로",
  "common.close": "닫기",
  "common.retry": "다시 시도",
  "common.loading": "불러오는 중",
  "common.openSettings": "설정 열기",

  "notification.restChannel": "휴식 알림",

  "webview.loadFailedTitle": "화면을 불러오지 못했어요",
  "webview.loadFailedBody": "네트워크 상태를 확인하고 다시 시도해 주세요.",
  "webview.loading": "화면을 불러오는 중",

  "permissionDenied.title": "카메라 권한이 필요해요",
  "permissionDenied.body":
    "측정은 카메라로만 할 수 있어요.\n설정에서 허용하면 바로 시작할 수 있어요.",
  "permissionDenied.privacy": "AI 분석용 영상은 기기 밖으로 나가지 않아요",
  "permissionDenied.backHome": "홈으로 돌아가기",

  "launchGoal.loading": "오늘 할 공부를 정리하고 있어요",

  "forceUpdate.title": "업데이트가 필요해요",
  "forceUpdate.description": "원활한 이용을 위해 최신 버전으로 업데이트 해주세요.",
  "forceUpdate.confirm": "지금 업데이트",
  "forceUpdate.reshowHint": "업데이트 안내를 다시 표시합니다",

  "recommendedUpdate.title": "새 버전이 나왔어요",
  "recommendedUpdate.description": "최신 버전으로 업데이트하면 더 나아진 포메를 쓸 수 있어요.",
  "recommendedUpdate.later": "나중에",
  "recommendedUpdate.confirm": "지금 업데이트",

  "appLock.shieldTitle": "지금은 공부에 집중하는 시간이에요",
  "appLock.shieldSubtitle": "포커스 메이커스 앱에서 공부를 끝내면 잠금이 풀려요",

  "appLockConsent.title": "방해 앱 잠금을 켜려면\n권한 두 가지가 필요해요",
  "appLockConsent.usageTitle": "사용정보 접근",
  "appLockConsent.usageBody": "지금 열린 앱이 잠긴 앱인지 확인할 때만 써요.",
  "appLockConsent.overlayTitle": "다른 앱 위에 표시",
  "appLockConsent.overlayBody": "공부 중에 잠긴 앱을 열면 잠금 화면을 띄워요.",
  "appLockConsent.installedApps":
    "잠그고 싶은 앱을 고를 수 있게 기기에 설치된 앱 목록을 조회해요. 조회된 정보는 기기 밖으로 전송되지 않아요.",
  "appLockConsent.granted": "허용됨",
  "appLockConsent.actionAgree": "동의하고 설정 열기",
  "appLockConsent.actionOverlay": "다른 앱 위에 표시 허용하기",
  "appLockConsent.actionUsage": "사용정보 접근 허용하기",

  "appLockBattery.title": "공부 중에 잠금이\n풀리지 않게 해 주세요",
  "appLockBattery.body": "휴대폰이 배터리를 아끼기 위해 잠금을 풀 수도 있어요.",
  "appLockBattery.stepBattery": "배터리",
  "appLockBattery.stepBatterySaver": "배터리 절약",
  "appLockBattery.stepBatteryUsage": "배터리 사용량",
  "appLockBattery.stepUnrestricted": "제한 없음 선택",
  "appLockBattery.stepNoRestrictions": "제한 없음 선택",
  "appLockBattery.stepAutostart": "자동 시작 켜기",

  "appLockPicker.title": "잠긴 앱",
  "appLockPicker.search": "앱 이름 검색",
  "appLockPicker.selected": "{{count}}개 선택",
  "appLockPicker.loadFailed": "앱 목록을 불러오지 못했어요",
  "appLockPicker.empty": "찾는 앱이 없어요",
} as const;

const en = {
  "tab.home": "Home",
  "tab.social": "Groups",
  "tab.records": "Records",
  "tab.ranking": "Ranking",
  "tab.settings": "Settings",

  "common.done": "Done",
  "common.back": "Back",
  "common.close": "Close",
  "common.retry": "Try again",
  "common.loading": "Loading",
  "common.openSettings": "Open settings",

  "notification.restChannel": "Break reminders",

  "webview.loadFailedTitle": "Couldn't load this screen",
  "webview.loadFailedBody": "Check your connection and try again.",
  "webview.loading": "Loading screen",

  "permissionDenied.title": "Camera access needed",
  "permissionDenied.body":
    "Focus can only be measured with the camera.\nAllow camera access in Settings to start right away.",
  "permissionDenied.privacy": "Video used for AI analysis never leaves your device",
  "permissionDenied.backHome": "Back to home",

  "launchGoal.loading": "Getting today's study ready",

  "forceUpdate.title": "Update required",
  "forceUpdate.description": "Please update to the latest version to keep using FocusMakers.",
  "forceUpdate.confirm": "Update now",
  "forceUpdate.reshowHint": "Shows the update notice again",

  "recommendedUpdate.title": "A new version is available",
  "recommendedUpdate.description":
    "Update to the latest version to get an even better FocusMakers.",
  "recommendedUpdate.later": "Later",
  "recommendedUpdate.confirm": "Update now",

  "appLock.shieldTitle": "It's time to focus on studying",
  "appLock.shieldSubtitle": "Finish studying in the FocusMakers app to unblock this app",

  "appLockConsent.title": "App blocking needs\ntwo permissions",
  "appLockConsent.usageTitle": "Usage access",
  "appLockConsent.usageBody": "Used only to check whether the app you open is a blocked app.",
  "appLockConsent.overlayTitle": "Display over other apps",
  "appLockConsent.overlayBody": "Shows a block screen when you open a blocked app while studying.",
  "appLockConsent.installedApps":
    "To let you choose which apps to block, FocusMakers reads the list of apps installed on your device. This list never leaves your device.",
  "appLockConsent.granted": "Allowed",
  "appLockConsent.actionAgree": "Agree and open settings",
  "appLockConsent.actionOverlay": "Allow display over other apps",
  "appLockConsent.actionUsage": "Allow usage access",

  "appLockBattery.title": "Keep apps blocked\nwhile you study",
  "appLockBattery.body": "Your phone may turn off app blocking to save battery.",
  "appLockBattery.stepBattery": "Battery",
  "appLockBattery.stepBatterySaver": "Battery saver",
  "appLockBattery.stepBatteryUsage": "App battery usage",
  "appLockBattery.stepUnrestricted": "Select Unrestricted",
  "appLockBattery.stepNoRestrictions": "Select No restrictions",
  "appLockBattery.stepAutostart": "Turn on Autostart",

  "appLockPicker.title": "Blocked apps",
  "appLockPicker.search": "Search apps",
  "appLockPicker.selected": "{{count}} selected",
  "appLockPicker.loadFailed": "Couldn't load your apps",
  "appLockPicker.empty": "No apps found",
} satisfies Record<keyof typeof ko, string>;

const ja = {
  "tab.home": "ホーム",
  "tab.social": "グループ",
  "tab.records": "記録",
  "tab.ranking": "ランキング",
  "tab.settings": "設定",

  "common.done": "完了",
  "common.back": "戻る",
  "common.close": "閉じる",
  "common.retry": "再試行",
  "common.loading": "読み込み中",
  "common.openSettings": "設定を開く",

  "notification.restChannel": "休憩の通知",

  "webview.loadFailedTitle": "画面を読み込めませんでした",
  "webview.loadFailedBody": "ネットワーク接続を確認して、もう一度お試しください。",
  "webview.loading": "画面を読み込み中",

  "permissionDenied.title": "カメラへのアクセスが必要です",
  "permissionDenied.body":
    "集中の測定にはカメラが必要です。\n「設定」でカメラへのアクセスを許可すると、すぐに始められます。",
  "permissionDenied.privacy": "AI分析用の映像がデバイスの外に出ることはありません",
  "permissionDenied.backHome": "ホームに戻る",

  "launchGoal.loading": "今日の勉強を準備しています",

  "forceUpdate.title": "アップデートが必要です",
  "forceUpdate.description":
    "FocusMakersを引き続きご利用いただくには、最新バージョンにアップデートしてください。",
  "forceUpdate.confirm": "今すぐアップデート",
  "forceUpdate.reshowHint": "アップデートのお知らせをもう一度表示します",

  "recommendedUpdate.title": "新しいバージョンがあります",
  "recommendedUpdate.description":
    "最新バージョンにアップデートすると、さらに使いやすくなったFocusMakersをご利用いただけます。",
  "recommendedUpdate.later": "後で",
  "recommendedUpdate.confirm": "今すぐアップデート",

  "appLock.shieldTitle": "今は勉強に集中する時間です",
  "appLock.shieldSubtitle": "FocusMakersアプリで勉強を終えると、このアプリのブロックが解除されます",

  "appLockConsent.title": "アプリブロックをオンにするには\n2つの権限が必要です",
  "appLockConsent.usageTitle": "使用状況へのアクセス",
  "appLockConsent.usageBody": "開いたアプリがブロック対象かどうかの確認にだけ使います。",
  "appLockConsent.overlayTitle": "他のアプリの上に重ねて表示",
  "appLockConsent.overlayBody": "勉強中にブロック対象のアプリを開くと、ブロック画面を表示します。",
  "appLockConsent.installedApps":
    "ブロックするアプリを選べるように、デバイスにインストールされているアプリの一覧を読み取ります。この一覧がデバイスの外に送信されることはありません。",
  "appLockConsent.granted": "許可済み",
  "appLockConsent.actionAgree": "同意して設定を開く",
  "appLockConsent.actionOverlay": "他のアプリの上に重ねて表示を許可",
  "appLockConsent.actionUsage": "使用状況へのアクセスを許可",

  "appLockBattery.title": "勉強中にブロックが\n解除されないようにしましょう",
  "appLockBattery.body":
    "スマートフォンがバッテリーを節約するために、ブロックを解除することがあります。",
  "appLockBattery.stepBattery": "バッテリー",
  "appLockBattery.stepBatterySaver": "バッテリーセーバー",
  "appLockBattery.stepBatteryUsage": "アプリのバッテリー使用量",
  "appLockBattery.stepUnrestricted": "「制限なし」を選択",
  "appLockBattery.stepNoRestrictions": "「制限なし」を選択",
  "appLockBattery.stepAutostart": "「自動起動」をオン",

  "appLockPicker.title": "ブロックするアプリ",
  "appLockPicker.search": "アプリを検索",
  "appLockPicker.selected": "{{count}}個を選択中",
  "appLockPicker.loadFailed": "アプリの一覧を読み込めませんでした",
  "appLockPicker.empty": "アプリが見つかりません",
} satisfies Record<keyof typeof ko, string>;

const zhHant = {
  "tab.home": "首頁",
  "tab.social": "群組",
  "tab.records": "紀錄",
  "tab.ranking": "排行榜",
  "tab.settings": "設定",

  "common.done": "完成",
  "common.back": "返回",
  "common.close": "關閉",
  "common.retry": "重試",
  "common.loading": "載入中",
  "common.openSettings": "開啟設定",

  "notification.restChannel": "休息提醒",

  "webview.loadFailedTitle": "無法載入畫面",
  "webview.loadFailedBody": "請檢查網路連線，然後再試一次。",
  "webview.loading": "正在載入畫面",

  "permissionDenied.title": "需要相機取用權限",
  "permissionDenied.body": "專注狀態只能透過相機測量。\n在「設定」中允許取用相機，就能馬上開始。",
  "permissionDenied.privacy": "AI 分析用的影像不會離開你的裝置",
  "permissionDenied.backHome": "返回首頁",

  "launchGoal.loading": "正在整理今天要讀的內容",

  "forceUpdate.title": "需要更新",
  "forceUpdate.description": "請更新至最新版本，以繼續使用 FocusMakers。",
  "forceUpdate.confirm": "立即更新",
  "forceUpdate.reshowHint": "再次顯示更新通知",

  "recommendedUpdate.title": "有新版本可用",
  "recommendedUpdate.description": "更新至最新版本，就能使用更好用的 FocusMakers。",
  "recommendedUpdate.later": "稍後",
  "recommendedUpdate.confirm": "立即更新",

  "appLock.shieldTitle": "現在是專心讀書的時間",
  "appLock.shieldSubtitle": "在 FocusMakers 完成讀書後，就會解除這個 App 的封鎖",

  "appLockConsent.title": "若要開啟 App 封鎖，\n需要兩項權限",
  "appLockConsent.usageTitle": "使用情況存取權",
  "appLockConsent.usageBody": "只會用來確認目前開啟的 App 是否已封鎖。",
  "appLockConsent.overlayTitle": "在其他應用程式上層顯示",
  "appLockConsent.overlayBody": "讀書時開啟已封鎖的 App，就會顯示封鎖畫面。",
  "appLockConsent.installedApps":
    "為了讓你選擇要封鎖的 App，FocusMakers 會讀取裝置上已安裝的 App 清單。這份清單不會傳送到裝置以外。",
  "appLockConsent.granted": "已允許",
  "appLockConsent.actionAgree": "同意並開啟設定",
  "appLockConsent.actionOverlay": "允許在其他應用程式上層顯示",
  "appLockConsent.actionUsage": "允許存取使用情況",

  "appLockBattery.title": "讓封鎖在讀書時\n保持有效",
  "appLockBattery.body": "手機可能會為了節省電力而解除封鎖。",
  "appLockBattery.stepBattery": "電池",
  "appLockBattery.stepBatterySaver": "省電策略",
  "appLockBattery.stepBatteryUsage": "應用程式電池用量",
  "appLockBattery.stepUnrestricted": "選取「不受限制」",
  "appLockBattery.stepNoRestrictions": "選取「無限制」",
  "appLockBattery.stepAutostart": "開啟「自動啟動」",

  "appLockPicker.title": "封鎖的 App",
  "appLockPicker.search": "搜尋 App",
  "appLockPicker.selected": "已選取 {{count}} 個",
  "appLockPicker.loadFailed": "無法載入 App 清單",
  "appLockPicker.empty": "找不到 App",
} satisfies Record<keyof typeof ko, string>;

export type CopyKey = keyof typeof ko;

/** 언어별 셸 문구 */
export const copy: Record<AppLocale, Record<CopyKey, string>> = { ko, en, ja, "zh-Hant": zhHant };

/**
 * 기기 선호 언어 목록에서 고른 셸 언어
 *
 * 웹뷰 주소의 lang 파라미터에도 같은 값을 넘긴다.
 * 모듈 로드 때 한 번 정하지 않고 부를 때마다 읽는다.
 * Android는 앱별 언어를 바꾸면 화면만 다시 만들고 JS 모듈은 그대로 남기 때문이다.
 */
export function getAppLocale(): AppLocale {
  return negotiateLocale(
    getLocales().map((locale) => locale.languageTag),
    APP_LOCALES,
  );
}

/** 기기 언어의 문구를 읽고 `{{이름}}` 자리를 채운다. */
export function t(key: CopyKey, vars?: Record<string, string | number>): string {
  const text = copy[getAppLocale()][key];
  return vars ? text.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(vars[name])) : text;
}
