package expo.modules.applock

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Intent
import android.content.pm.ServiceInfo
import android.content.res.ColorStateList
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.view.WindowManager
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.annotation.RequiresApi

private const val CHANNEL_ID = "app_lock"
private const val NOTIFICATION_ID = 7461
private const val POLL_MS = 500L
// 사용 기록은 조금 늦게 기록될 수 있어 지난번 조회와 1초씩 겹쳐 읽는다.
private const val QUERY_OVERLAP_MS = 1_000L
// 29부터 MOVE_TO_FOREGROUND가 ACTIVITY_RESUMED로 이름만 바뀌었고 값은 같다.
@Suppress("DEPRECATION")
private val FOREGROUND_EVENT = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
  UsageEvents.Event.ACTIVITY_RESUMED
} else {
  UsageEvents.Event.MOVE_TO_FOREGROUND
}

/**
 * 공부하는 동안 고른 앱을 잠그는 포그라운드 서비스
 *
 * Android에는 다른 앱을 막는 공개 API가 없어 0.5초마다 앞에 뜬 앱을 사용 기록으로 확인하고, 잠긴 앱이면 그 위에 잠금 화면 창을 띄운다.
 * 앱 프로세스 안에서 돌아서 앱이 죽거나 최근 앱에서 지워지면 함께 끝나 잠금이 남지 않는다.
 */
@RequiresApi(Build.VERSION_CODES.O)
class AppLockService : Service() {
  companion object {
    const val EXTRA_DURATION_MS = "durationMs"
    const val EXTRA_COUNT = "count"
    const val EXTRA_GENERATION = "generation"
    const val ACTION_STOP = "expo.modules.applock.STOP"

    // 서비스와 같은 프로세스에 하나만 두어 JS가 다시 로드돼도 돌고 있는지 잊지 않는다.
    internal val requests = LockRequests()
  }

  private val handler = Handler(Looper.getMainLooper())
  private val poll = Runnable { checkForeground() }
  private val tracker = ForegroundTracker(FOREGROUND_EVENT)
  private var locked: Set<String> = emptySet()
  private var lastQueryAt = 0L
  private var deadline = Long.MAX_VALUE
  private var generation = 0L
  private var overlay: View? = null
  private var lastStartId = 0

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    lastStartId = startId
    val stopCommand = intent?.action == ACTION_STOP
    // startForegroundService로 온 시작 명령은 멈추기 전에도 startForeground를 불러야 앱이 죽지 않는다.
    // 해제 명령은 startService로 오고, 앞선 시작 명령이 이미 startForeground를 불렀다.
    if (!stopCommand) startInForeground(intent?.getIntExtra(EXTRA_COUNT, 0) ?: 0)
    // 명령은 온 순서대로 오지만 그사이 시작·해제가 더 왔을 수 있어 명령 종류가 아니라 지금 요청 상태를 따른다.
    if (!requests.running) {
      finish()
      return START_NOT_STICKY
    }
    if (stopCommand) return START_NOT_STICKY
    locked = AppLockPrefs.selected(this)
    val startGeneration = intent?.getLongExtra(EXTRA_GENERATION, 0L) ?: 0L
    lastQueryAt = System.currentTimeMillis()
    // Handler 지연은 기기가 잠든 시간을 세지 않아 12시간 타이머로 걸면 잠금이 12시간을 훌쩍 넘길 수 있다.
    // 잠든 시간까지 세는 elapsedRealtime으로 마감을 잡고 조회할 때마다 확인한다.
    // 잠든 동안에는 화면이 꺼져 잠금 화면이 보일 일이 없고 깨어나면 첫 조회에서 멈추므로 알람은 따로 걸지 않는다.
    deadline = nextDeadline(
      generation,
      deadline,
      startGeneration,
      SystemClock.elapsedRealtime(),
      intent?.getLongExtra(EXTRA_DURATION_MS, 0L) ?: 0L,
    )
    generation = startGeneration
    handler.removeCallbacksAndMessages(null)
    handler.post(poll)
    // 시스템이 서비스를 다시 살리면 공부 세션 없이 잠금만 돌아와서 다시 시작하지 않는다.
    return START_NOT_STICKY
  }

  /**
   * 잠금 끝내기
   *
   * 아직 처리하지 않은 시작 명령이 남았는데 서비스를 내리면 그 명령의 startForeground를 기다리던 Android가 앱을 죽인다.
   * 마지막으로 받은 명령 번호로 멈춰서 뒤에 온 명령이 있으면 서비스를 남겨 그 명령이 처리되게 한다.
   */
  private fun finish() {
    handler.removeCallbacksAndMessages(null)
    hideOverlay()
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf(lastStartId)
  }

  override fun onDestroy() {
    handler.removeCallbacksAndMessages(null)
    hideOverlay()
    super.onDestroy()
  }

  private fun startInForeground(count: Int) {
    val manager = getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(
      NotificationChannel(CHANNEL_ID, "방해 앱 잠금", NotificationManager.IMPORTANCE_LOW)
    )
    val open = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    val notification = Notification.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.drawable.app_lock_ic_lock)
      .setContentTitle("공부 중 · 방해 앱 ${count}개 잠김")
      .setContentText("공부를 끝내면 잠금이 풀려요")
      .setContentIntent(open)
      .setOngoing(true)
      .build()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  /**
   * 지금 앞에 뜬 앱 확인
   *
   * 마지막으로 앞에 온 앱을 기억해 두고 새 기록이 있을 때만 바꾼다.
   * 사용정보 접근을 끄면 기록이 비어 잠금 화면을 띄우지 못하고, 그 상태는 다음 조회 때 웹이 권한 꺼짐으로 처리한다.
   */
  private fun checkForeground() {
    if (isPastDeadline(SystemClock.elapsedRealtime(), deadline)) {
      // 끝난 뒤에 온 해제가 서비스를 다시 깨우지 않게 요청 상태도 내린다.
      requests.stopIfCurrent(generation)
      finish()
      return
    }
    val now = System.currentTimeMillis()
    val usage = getSystemService(UsageStatsManager::class.java)
    val events = usage.queryEvents(lastQueryAt - QUERY_OVERLAP_MS, now)
    val event = UsageEvents.Event()
    while (events.hasNextEvent()) {
      events.getNextEvent(event)
      tracker.onEvent(event.timeStamp, event.packageName, event.eventType)
    }
    lastQueryAt = now
    // 공부 중에 기본 홈 앱이 바뀔 수 있어 조회할 때마다 다시 확인한다.
    if (shouldLock(tracker.current, locked, defaultHomePackage(this), packageName)) showOverlay() else hideOverlay()
    handler.postDelayed(poll, POLL_MS)
  }

  private fun showOverlay() {
    if (overlay != null || !Settings.canDrawOverlays(this)) return
    val view = lockView()
    val params = WindowManager.LayoutParams(
      MATCH_PARENT,
      MATCH_PARENT,
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
      // 시스템 뒤로가기는 잠긴 앱으로 넘겨 앱을 닫고 나갈 수 있게 한다.
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
      PixelFormat.OPAQUE,
    )
    // 확인한 직후 권한이 꺼지면 창을 띄우다 예외가 나서 서비스째 죽지 않게 다음 조회로 넘긴다.
    try {
      getSystemService(WindowManager::class.java).addView(view, params)
      overlay = view
    } catch (e: WindowManager.BadTokenException) {
    } catch (e: SecurityException) {
    }
  }

  private fun hideOverlay() {
    val view = overlay ?: return
    overlay = null
    // 시스템이 창을 먼저 거둬 간 경우라 내릴 것이 없다.
    try {
      getSystemService(WindowManager::class.java).removeView(view)
    } catch (e: IllegalArgumentException) {
    }
  }

  /**
   * 포메로 돌아가기
   *
   * 다른 앱 위에 창이 떠 있는 동안에만 뒤에서 화면을 열 수 있어 화면을 연 뒤에 창을 내린다.
   * 포메가 앞에 온 기록이 다음 조회까지 늦게 와도 창이 다시 뜨지 않게 앞 앱을 미리 포메로 둔다.
   */
  private fun returnToApp() {
    packageManager.getLaunchIntentForPackage(packageName)?.let {
      startActivity(it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT))
    }
    tracker.override(packageName)
    hideOverlay()
  }

  private fun lockView(): View {
    val dark = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
      Configuration.UI_MODE_NIGHT_YES
    // 디자인 토큰의 라이트·다크 값이다.
    val pageColor = Color.parseColor(if (dark) "#101419" else "#F2F4F6")
    val subtle = Color.parseColor(if (dark) "#1B2B4D" else "#E8F3FF")
    val brand = Color.parseColor(if (dark) "#3182F6" else "#1B64DA")
    val primaryText = Color.parseColor(if (dark) "#F9FAFB" else "#191F28")
    val secondaryText = Color.parseColor(if (dark) "#B0B8C1" else "#6B7684")

    val icon = ImageView(this).apply {
      setImageResource(R.drawable.app_lock_ic_lock)
      imageTintList = ColorStateList.valueOf(brand)
    }
    val circle = FrameLayout(this).apply {
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(subtle)
      }
      addView(icon, FrameLayout.LayoutParams(dp(36), dp(36), Gravity.CENTER))
    }
    val title = TextView(this).apply {
      text = "지금은 공부에 집중하고,\n쉴 땐 확실히 쉬자고요:)"
      setTextColor(primaryText)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
    }
    val subtitle = TextView(this).apply {
      text = "공부가 끝나면 다시 열려요"
      setTextColor(secondaryText)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
      gravity = Gravity.CENTER
    }
    val content = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      addView(circle, LinearLayout.LayoutParams(dp(84), dp(84)))
      addView(title, LinearLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT).apply { topMargin = dp(24) })
      addView(subtitle, LinearLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT).apply { topMargin = dp(8) })
    }
    val button = TextView(this).apply {
      // 모양은 TextView로 그리되 TalkBack에는 버튼으로 읽히게 한다.
      accessibilityDelegate = object : View.AccessibilityDelegate() {
        override fun onInitializeAccessibilityNodeInfo(host: View, info: AccessibilityNodeInfo) {
          super.onInitializeAccessibilityNodeInfo(host, info)
          info.className = Button::class.java.name
        }
      }
      text = "포커스 메이커스로 돌아가기"
      setTextColor(Color.WHITE)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
      background = GradientDrawable().apply {
        cornerRadius = dp(16).toFloat()
        setColor(brand)
      }
      isClickable = true
      setOnClickListener { returnToApp() }
    }
    return FrameLayout(this).apply {
      setBackgroundColor(pageColor)
      addView(content, FrameLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT, Gravity.CENTER))
      addView(
        button,
        FrameLayout.LayoutParams(MATCH_PARENT, dp(52), Gravity.BOTTOM).apply {
          setMargins(dp(20), 0, dp(20), dp(32))
        },
      )
    }
  }

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
}
