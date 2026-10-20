package expo.modules.applock

/**
 * 사용 기록으로 지금 앞에 뜬 앱 추적
 *
 * 조회 구간을 1초씩 겹쳐 읽어서 이미 본 기록이 다시 들어온다.
 * 같은 밀리초에 찍힌 기록도 버리지 않도록 마지막 시각과 그 시각에 본 앱을 함께 기억한다.
 * 이미 본 기록을 다시 반영하면 포메로 돌아가기 직후 잠긴 앱이 앞 앱으로 되살아나 잠금 화면이 다시 뜬다.
 */
internal class ForegroundTracker(private val foregroundEventType: Int) {
  var current: String? = null
    private set
  private var lastAt = Long.MIN_VALUE
  private val seenAtLast = mutableSetOf<String>()

  fun onEvent(timestamp: Long, packageName: String, eventType: Int) {
    if (eventType != foregroundEventType || timestamp < lastAt) return
    if (timestamp > lastAt) {
      lastAt = timestamp
      seenAtLast.clear()
    }
    if (seenAtLast.add(packageName)) current = packageName
  }

  /** 기록이 늦게 와도 화면이 바뀐 것을 먼저 반영할 때 쓴다. 이미 본 기록은 그대로 건너뛴다. */
  fun override(packageName: String) {
    current = packageName
  }
}

/** 기본 홈 앱과 이 앱은 목록에 남아 있어도 잠그지 않는다. 잠그면 홈 화면이나 포메로 돌아갈 길이 막힌다. */
internal fun lockable(selected: Set<String>, homePackage: String?, ownPackage: String): Set<String> =
  selected - setOfNotNull(homePackage, ownPackage)

internal fun shouldLock(foreground: String?, locked: Set<String>, homePackage: String?, ownPackage: String) =
  foreground != null && foreground in lockable(locked, homePackage, ownPackage)

/** 잠금 시간이 0 이하면 마감 없이 공부가 끝날 때까지 잠근다. */
internal fun lockDeadline(startElapsed: Long, durationMs: Long): Long =
  if (durationMs > 0) startElapsed + durationMs else Long.MAX_VALUE

internal fun isPastDeadline(nowElapsed: Long, deadline: Long) = nowElapsed >= deadline

/**
 * 시작 명령을 받았을 때의 마감
 *
 * 마감은 시작 번호마다 따로 잡는다.
 * 앞 공부의 마감을 남기면 서비스가 아직 살아 있을 때 들어온 새 공부가 그 마감에 바로 풀린다.
 * 같은 번호의 시작이 다시 오면 같은 요청이라 마감을 그대로 둔다.
 */
internal fun nextDeadline(
  currentGeneration: Long,
  currentDeadline: Long,
  startGeneration: Long,
  startElapsed: Long,
  durationMs: Long,
): Long =
  if (startGeneration == currentGeneration) currentDeadline else lockDeadline(startElapsed, durationMs)

/** 지운 앱이 고른 개수와 잠금 대상에 남지 않게 지금 설치된 앱만 남긴다. */
internal fun installedOnly(stored: Set<String>, installed: Set<String>): Set<String> = stored intersect installed

/**
 * 잠금 시작·해제 요청 상태
 *
 * 시작 직후 해제가 오면 서비스가 startForeground를 부르기 전에 멈춰 Android가 앱 프로세스를 죽인다.
 * 그래서 해제도 서비스에 명령으로 보내 시작과 같은 줄에서 처리하고, 서비스는 명령을 받을 때마다 이 값으로 계속 돌지 정한다.
 * 늦게 도착한 시작 명령은 이미 해제됐으면 멈추고, 사이에 낀 해제 명령은 다시 시작됐으면 멈추지 않는다.
 * 돌고 있지 않을 때 온 해제는 서비스를 깨우지 않는다.
 * 시작마다 번호를 올려서, 앞 공부의 마감이나 실패한 시작이 그 뒤에 온 시작의 잠금을 풀지 못하게 한다.
 */
internal class LockRequests {
  @Volatile
  var running = false
    private set
  private var generation = 0L
  private var runningBeforeStart = false

  /** 시작 명령을 보내기 전에 부르고, 돌려받은 번호를 명령에 실어 보낸다. */
  @Synchronized
  fun start(): Long {
    runningBeforeStart = running
    running = true
    return ++generation
  }

  /** 마감이 지났을 때 부른다. 그 사이 새 시작이 왔으면 새 공부의 잠금이라 내리지 않는다. */
  @Synchronized
  fun stopIfCurrent(generation: Long) {
    if (generation == this.generation) running = false
  }

  /** 시작 명령을 보내지 못했을 때 그 시작만 없던 일로 한다. 앞 공부가 돌던 중이면 그 공부의 해제와 마감이 그대로 통하게 상태와 번호를 함께 되돌린다. */
  @Synchronized
  fun rollback(generation: Long) {
    if (generation != this.generation) return
    running = runningBeforeStart
    this.generation--
  }

  /** 해제 명령을 보내야 하면 true를 돌려준다. */
  @Synchronized
  fun stop(): Boolean {
    val wasRunning = running
    running = false
    return wasRunning
  }
}
