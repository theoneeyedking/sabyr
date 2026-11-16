package expo.modules.sabyrsignals

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.display.DisplayManager
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.telephony.TelephonyManager
import android.view.Display
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Сигналы устройства для Sabyr.
 *
 * Звонок: режим аудио AudioManager (MODE_IN_CALL / MODE_IN_COMMUNICATION / MODE_RINGTONE).
 * Разрешений не требует и ловит не только обычные звонки, но и VoIP (WhatsApp, Telegram) —
 * именно так чаще всего звонят мошенники. Если выдано READ_PHONE_STATE, дополнительно
 * учитывается состояние TelephonyManager.
 *
 * Демонстрация экрана: наличие дополнительного дисплея в DisplayManager
 * (виртуальный, презентационный, трансляция на другой экран).
 */
class SabyrSignalsModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val handler = Handler(Looper.getMainLooper())
  private var observing = false
  private var lastCall: Boolean? = null
  private var lastScreen: Boolean? = null

  // Режим аудио меняется без широковещательных событий на старых версиях Android,
  // поэтому, пока есть подписчики, состояние дополнительно опрашивается раз в секунду.
  private val pollTask = object : Runnable {
    override fun run() {
      emitIfChanged()
      if (observing) handler.postDelayed(this, POLL_INTERVAL_MS)
    }
  }

  private val displayListener = object : DisplayManager.DisplayListener {
    override fun onDisplayAdded(displayId: Int) = emitIfChanged()
    override fun onDisplayRemoved(displayId: Int) = emitIfChanged()
    override fun onDisplayChanged(displayId: Int) = emitIfChanged()
  }

  // Хранится как Any?, чтобы класс загружался и на Android ниже 12 (API 31).
  private var modeListener: Any? = null

  override fun definition() = ModuleDefinition {
    Name("SabyrSignals")

    Events(EVENT_NAME)

    Function("isCallActive") { isCallActive() }

    Function("isScreenShared") { isScreenShared() }

    Function("getSignals") { snapshot() }

    OnStartObserving { startObserving() }

    OnStopObserving { stopObserving() }

    OnDestroy { stopObserving() }
  }

  private fun audioManager() = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager

  private fun displayManager() = context.getSystemService(Context.DISPLAY_SERVICE) as? DisplayManager

  private fun audioMode(): Int = audioManager()?.mode ?: AudioManager.MODE_NORMAL

  private fun hasPhonePermission(): Boolean =
    context.checkSelfPermission(Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED

  /** Состояние телефонии; null — разрешения нет или сервис недоступен. */
  @Suppress("DEPRECATION")
  private fun telephonyBusy(): Boolean? {
    if (!hasPhonePermission()) return null
    return try {
      val tm = context.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager ?: return null
      val state = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) tm.callStateForSubscription else tm.callState
      state != TelephonyManager.CALL_STATE_IDLE
    } catch (e: SecurityException) {
      null
    } catch (e: UnsupportedOperationException) {
      null // устройство без телефонии (планшет)
    }
  }

  private fun isCallActive(): Boolean {
    val byAudio = audioMode() in CALL_AUDIO_MODES
    return byAudio || telephonyBusy() == true
  }

  /** Дополнительные (не встроенные) включённые дисплеи. */
  private fun extraDisplays(): List<Display> {
    val displays = displayManager()?.displays ?: return emptyList()
    return displays.filter { it.displayId != Display.DEFAULT_DISPLAY && it.state != Display.STATE_OFF }
  }

  private fun isScreenShared(): Boolean = extraDisplays().isNotEmpty()

  private fun snapshot(): Map<String, Any?> {
    val extra = extraDisplays()
    return mapOf(
      "callActive" to isCallActive(),
      "screenShared" to extra.isNotEmpty(),
      "audioMode" to audioMode(),
      "telephonyBusy" to telephonyBusy(),
      "phonePermission" to hasPhonePermission(),
      "extraDisplays" to extra.map { it.name ?: "display ${it.displayId}" }
    )
  }

  private fun emitIfChanged() {
    val (call, screen) = try {
      isCallActive() to isScreenShared()
    } catch (e: Throwable) {
      return // контекст уже уничтожен
    }
    if (call == lastCall && screen == lastScreen) return
    lastCall = call
    lastScreen = screen
    sendEvent(EVENT_NAME, snapshot())
  }

  private fun startObserving() {
    if (observing) return
    observing = true
    displayManager()?.registerDisplayListener(displayListener, handler)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val listener = AudioManager.OnModeChangedListener { emitIfChanged() }
      audioManager()?.addOnModeChangedListener(context.mainExecutor, listener)
      modeListener = listener
    }
    handler.post(pollTask)
  }

  private fun stopObserving() {
    if (!observing) return
    observing = false
    handler.removeCallbacks(pollTask)
    try {
      displayManager()?.unregisterDisplayListener(displayListener)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        (modeListener as? AudioManager.OnModeChangedListener)?.let { audioManager()?.removeOnModeChangedListener(it) }
      }
    } catch (e: Throwable) {
      // контекст уже уничтожен — слушатели сняты вместе с ним
    }
    modeListener = null
    lastCall = null
    lastScreen = null
  }

  companion object {
    private const val EVENT_NAME = "onSignalsChange"
    private const val POLL_INTERVAL_MS = 1000L
    private val CALL_AUDIO_MODES = setOf(
      AudioManager.MODE_IN_CALL,
      AudioManager.MODE_IN_COMMUNICATION,
      AudioManager.MODE_RINGTONE
    )
  }
}
