package expo.modules.applock

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

private const val RESUMED = 1
private const val PAUSED = 2

class ForegroundTrackerTest {
  private val tracker = ForegroundTracker(RESUMED)

  @Test
  fun 마지막으로_앞에_온_앱을_기억한다() {
    tracker.onEvent(100, "a", RESUMED)
    tracker.onEvent(200, "b", RESUMED)
    assertEquals("b", tracker.current)
  }

  @Test
  fun 앞에_온_기록이_아니면_무시한다() {
    tracker.onEvent(100, "a", RESUMED)
    tracker.onEvent(200, "b", PAUSED)
    assertEquals("a", tracker.current)
  }

  @Test
  fun 기록이_없으면_앞_앱을_모른다() {
    assertNull(tracker.current)
  }

  @Test
  fun 겹쳐_읽은_옛_기록은_앞_앱을_되돌리지_않는다() {
    tracker.onEvent(100, "a", RESUMED)
    tracker.onEvent(200, "b", RESUMED)
    // 다음 조회가 1초 겹쳐 같은 기록을 다시 읽는다.
    tracker.onEvent(100, "a", RESUMED)
    tracker.onEvent(200, "b", RESUMED)
    assertEquals("b", tracker.current)
  }

  @Test
  fun 같은_시각에_찍힌_두_기록은_나중_것을_따른다() {
    tracker.onEvent(100, "a", RESUMED)
    tracker.onEvent(100, "b", RESUMED)
    assertEquals("b", tracker.current)
  }

  @Test
  fun 직접_바꾼_앞_앱은_다시_읽은_기록에_덮이지_않는다() {
    tracker.onEvent(100, "locked", RESUMED)
    tracker.override("own")
    tracker.onEvent(100, "locked", RESUMED)
    assertEquals("own", tracker.current)
  }

  @Test
  fun 직접_바꾼_뒤에도_새_기록은_따른다() {
    tracker.onEvent(100, "locked", RESUMED)
    tracker.override("own")
    tracker.onEvent(100, "other", RESUMED)
    assertEquals("other", tracker.current)
  }
}

class LockDecisionTest {
  @Test
  fun 잠긴_앱이_앞에_오면_잠근다() {
    assertTrue(shouldLock("game", setOf("game"), "home", "own"))
  }

  @Test
  fun 잠기지_않은_앱이나_모르는_앱은_잠그지_않는다() {
    assertFalse(shouldLock("chat", setOf("game"), "home", "own"))
    assertFalse(shouldLock(null, setOf("game"), "home", "own"))
  }

  @Test
  fun 기본_홈_앱은_목록에_있어도_잠그지_않는다() {
    assertFalse(shouldLock("home", setOf("home"), "home", "own"))
  }

  @Test
  fun 이_앱은_목록에_있어도_잠그지_않는다() {
    assertFalse(shouldLock("own", setOf("own"), "home", "own"))
  }

  @Test
  fun 잠글_수_있는_앱만_남긴다() {
    assertEquals(setOf("game"), lockable(setOf("game", "home", "own"), "home", "own"))
    assertEquals(setOf("game"), lockable(setOf("game", "own"), null, "own"))
  }
}

class LockDeadlineTest {
  @Test
  fun 시작_시각에_잠금_시간을_더한_때가_마감이다() {
    assertEquals(1_500L, lockDeadline(1_000L, 500L))
  }

  @Test
  fun 마감을_넘기면_멈춘다() {
    val deadline = lockDeadline(1_000L, 500L)
    assertFalse(isPastDeadline(1_499L, deadline))
    assertTrue(isPastDeadline(1_500L, deadline))
  }

  @Test
  fun 처음_시작하면_새_마감을_잡는다() {
    assertEquals(1_500L, nextDeadline(0L, Long.MAX_VALUE, 1L, 1_000L, 500L))
  }

  @Test
  fun 같은_번호의_시작이_다시_오면_마감을_그대로_둔다() {
    val first = nextDeadline(0L, Long.MAX_VALUE, 1L, 1_000L, 500L)
    assertEquals(first, nextDeadline(1L, first, 1L, 1_400L, 500L))
  }

  @Test
  fun 새_번호의_시작은_앞_공부의_마감을_물려받지_않는다() {
    val first = nextDeadline(0L, Long.MAX_VALUE, 1L, 1_000L, 500L)
    assertEquals(1_900L, nextDeadline(1L, first, 2L, 1_400L, 500L))
  }

  @Test
  fun 잠금_시간이_없으면_마감도_없다() {
    assertFalse(isPastDeadline(Long.MAX_VALUE - 1, lockDeadline(1_000L, 0L)))
  }
}

class LockRequestsTest {
  private val requests = LockRequests()

  @Test
  fun 시작_직후_해제하면_멈춘_상태로_끝난다() {
    requests.start()
    assertTrue(requests.stop())
    // 서비스가 늦게 받은 시작 명령도 이 값을 보고 바로 멈춘다.
    assertFalse(requests.running)
  }

  @Test
  fun 돌고_있지_않을_때_해제는_서비스를_깨우지_않는다() {
    assertFalse(requests.stop())
    assertFalse(requests.running)
  }

  @Test
  fun 시작_해제_시작이면_돌고_있다() {
    requests.start()
    requests.stop()
    requests.start()
    // 사이에 온 해제 명령은 이 값을 보고 멈추지 않는다.
    assertTrue(requests.running)
  }

  @Test
  fun 해제가_두_번_와도_명령은_한_번만_보낸다() {
    requests.start()
    assertTrue(requests.stop())
    assertFalse(requests.stop())
  }

  @Test
  fun 새_시작이_온_뒤에_도착한_앞_공부의_마감은_멈추지_않는다() {
    val old = requests.start()
    requests.start()
    requests.stopIfCurrent(old)
    // 뒤따라 도착한 시작 명령이 이 값을 보고 잠금을 이어 간다.
    assertTrue(requests.running)
  }

  @Test
  fun 지금_공부의_마감이면_멈춘다() {
    val current = requests.start()
    requests.stopIfCurrent(current)
    assertFalse(requests.running)
    // 끝난 뒤에 온 해제는 서비스를 깨우지 않는다.
    assertFalse(requests.stop())
  }

  @Test
  fun 시작에_실패하면_시작_전으로_되돌린다() {
    val failed = requests.start()
    requests.rollback(failed)
    assertFalse(requests.running)
  }

  @Test
  fun 돌던_중에_시작이_실패해도_돌던_공부는_그대로다() {
    val running = requests.start()
    val failed = requests.start()
    requests.rollback(failed)
    assertTrue(requests.running)
    requests.stopIfCurrent(running)
    assertFalse(requests.running)
  }

  @Test
  fun 새_시작이_온_뒤에는_앞_시작을_되돌리지_않는다() {
    val failed = requests.start()
    requests.start()
    requests.rollback(failed)
    assertTrue(requests.running)
  }
}

/** 서비스가 명령과 조회를 처리하는 순서를 그대로 밟아 앞 공부의 마감이 새 공부를 끝내지 않는지 본다. */
class LockOrderingTest {
  private val requests = LockRequests()
  private var generation = 0L
  private var deadline = Long.MAX_VALUE

  private fun onStart(generation: Long, nowElapsed: Long) {
    deadline = nextDeadline(this.generation, deadline, generation, nowElapsed, 500L)
    this.generation = generation
  }

  /** 마감이 지났으면 서비스처럼 요청 상태를 내리고 true를 돌려준다. */
  private fun pollEnds(nowElapsed: Long): Boolean {
    if (!isPastDeadline(nowElapsed, deadline)) return false
    requests.stopIfCurrent(generation)
    return true
  }

  @Test
  fun 앞_공부의_마감_직전에_새_시작이_먼저_처리되면_새_마감을_따른다() {
    onStart(requests.start(), 1_000L)
    onStart(requests.start(), 1_499L)
    assertFalse(pollEnds(1_500L))
    assertTrue(requests.running)
  }

  @Test
  fun 해제_뒤_바로_시작해_해제_명령을_처리할_때_돌고_있으면_새_마감을_따른다() {
    onStart(requests.start(), 1_000L)
    requests.stop()
    val next = requests.start()
    // 해제 명령은 이미 돌고 있는 상태를 보고 멈추지 않는다.
    assertTrue(requests.running)
    onStart(next, 1_499L)
    assertFalse(pollEnds(1_500L))
    assertTrue(requests.running)
  }

  @Test
  fun 새_시작이_처리되기_전에_앞_마감이_오면_앞_공부만_끝난다() {
    onStart(requests.start(), 1_000L)
    val next = requests.start()
    assertTrue(pollEnds(1_500L))
    // 뒤따라 처리되는 시작 명령이 이 값을 보고 잠금을 이어 간다.
    assertTrue(requests.running)
    onStart(next, 1_501L)
    assertFalse(pollEnds(1_501L))
  }
}

class InstalledSelectionTest {
  @Test
  fun 지운_앱은_고른_목록에서_빠진다() {
    assertEquals(setOf("game"), installedOnly(setOf("game", "removed"), setOf("game", "chat")))
  }

  @Test
  fun 다_설치돼_있으면_그대로다() {
    assertEquals(setOf("game", "chat"), installedOnly(setOf("game", "chat"), setOf("game", "chat", "home")))
  }
}
