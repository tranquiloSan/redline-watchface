/**
 * REDLINE — tachometer watch face for Amazfit Active 3 Premium (466×466 round)
 *
 * The big needle is a rev counter for the current hour: it sweeps 0→60 minutes
 * over a 270° scale (0 = bottom-left, 60 = bottom-right) and "redlines" in the
 * last 10 minutes. One rotation per hour → RPH.
 *   GEAR box  = hour        Shift lights = one LED per 10 s of the minute
 *   FUEL      = battery     TEMP         = current temp within today's low…high
 *   ODO       = steps       bottom line  = date + heart rate
 *   Warning lamps = alarm set / stopwatch holds a time / timer running.
 *   While an alarm is set its time replaces the RPH label.
 *
 * If build() runs in the always-on (AOD) scene it creates only the AOD layer;
 * otherwise it creates the normal layer plus the AOD layer, so either way the
 * system has an always-on version to show.
 */
import * as ui from '@zos/ui'
import { getScene, SCENE_AOD } from '@zos/app'
import { Time, Battery, Step } from '@zos/sensor'
import { log as zlog } from '@zos/utils'

// ---------- layout (466 design px) ----------
const C = 233
const SCALE_START = -135 // degrees, 12 o'clock = 0, clockwise
const SCALE_SWEEP = 270
const FUEL = { x: 128, y: 238 }
const TEMP = { x: 338, y: 238 }
const MINI_START = -110
const MINI_END = 110
const LAMP_X = [193, 233, 273] // centres; lamp images are 40×40
const LAMP_Y = 186

// show_level constants (fall back to the documented bit values if missing)
const SL = ui.show_level || {}
const NORMAL = SL.ONLY_NORMAL !== undefined ? SL.ONLY_NORMAL : 1
const AOD = SL.ONAL_AOD !== undefined ? SL.ONAL_AOD : SL.ONLY_AOD !== undefined ? SL.ONLY_AOD : 2

const img = (p) => 'images/' + p + '.png'
const digits = (dir) => Array.from({ length: 10 }, (_, i) => img(dir + '/' + i))
const pad2 = (n) => (n < 10 ? '0' : '') + n
const logger = zlog.getLogger('redline')
const log = (...a) => logger.log('[redline] ' + a.join(' '))

// ---------- state ----------
let isAod = false
let tickTimer = null
let battery = null
let step = null
const time = new Time()
const last = {} // cache to avoid redundant redraws
const w = {} // widgets on the normal screen
const wa = {} // widgets on the always-on screen
const sets = [['n', w], ['a', wa]]

function set(widget, key, prop, value) {
  if (!widget || last[key] === value) return
  last[key] = value
  widget.setProperty(prop, value)
}

function safe(name, fn) {
  try {
    fn()
  } catch (e) {
    log('error in', name, e && e.message ? e.message : e)
  }
}

function create(type, opts) {
  return ui.createWidget(type, opts)
}

// Full-screen rotating image whose pivot (px, py inside the image) sits on (cx, cy)
function rotatingImg(src, px, py, cx, cy, level) {
  return create(ui.widget.IMG, {
    x: 0, y: 0, w: 466, h: 466,
    pos_x: cx - px, pos_y: cy - py,
    center_x: cx, center_y: cy,
    src: src, angle: 0, show_level: level,
  })
}

// ---------- updates ----------
function updateNeedle() {
  const m = time.getMinutes()
  const s = isAod ? 0 : time.getSeconds()
  const a = Math.round((SCALE_START + (SCALE_SWEEP * (m + s / 60)) / 60) * 10) / 10
  set(w.needle, 'needle', ui.prop.ANGLE, a)
  set(wa.needle, 'needleA', ui.prop.ANGLE, Math.round(SCALE_START + (SCALE_SWEEP * m) / 60))
}

function updateGear() {
  const h = pad2(time.getHours())
  for (const [k, o] of sets) {
    set(o.gear0, k + 'gear0', ui.prop.SRC, img('gear/' + h[0]))
    set(o.gear1, k + 'gear1', ui.prop.SRC, img('gear/' + h[1]))
  }
}

function updateLights(halfTick) {
  const s = time.getSeconds()
  let n = Math.floor(s / 10) + 1 // 1..6 → which 10-second block we're in
  if (s >= 57) n = halfTick ? 0 : 6 // flash before the minute rolls over
  set(w.lights, 'lights', ui.prop.SRC, img('lights/' + n))
}

function updateDate() {
  for (const [k, o] of sets) {
    set(o.week, k + 'week', ui.prop.SRC, img('date/w' + time.getDay())) // 1 = Monday
    set(o.month, k + 'month', ui.prop.SRC, img('date/m' + time.getMonth())) // 1..12
    set(o.day, k + 'day', ui.prop.TEXT, String(time.getDate()))
  }
}

function updateBattery() {
  if (!battery) return
  const b = Math.max(0, Math.min(100, battery.getCurrent()))
  set(w.fuelFill, 'fuelFill', ui.prop.SRC, img('fuel/' + Math.round(b / 5)))
  set(w.fuelNeedle, 'fuelNeedle', ui.prop.ANGLE, Math.round(MINI_START + ((MINI_END - MINI_START) * b) / 100))
}

function updateSteps() {
  if (!step) return
  const str = String(Math.min(999999, step.getCurrent() || 0)).padStart(6, '0')
  for (let i = 0; i < 6; i++) {
    set(w.odo[i], 'odo' + i, ui.prop.SRC, img((i === 5 ? 'odo_last/' : 'odo/') + str[i]))
  }
}

function onMinute() {
  safe('minute', () => {
    updateNeedle()
    updateGear()
  })
}

function updateAll() {
  onMinute()
  safe('date', updateDate)
  safe('battery', updateBattery)
  safe('steps', updateSteps)
  if (!isAod) safe('lights', () => updateLights(false))
}

// 2 Hz while the screen is on: sweeping needle + shift lights
function startTicking() {
  if (isAod || tickTimer) return
  let half = false
  tickTimer = setInterval(() => {
    half = !half
    updateLights(half)
    if (!half) updateNeedle()
  }, 500)
}

function stopTicking() {
  if (tickTimer) {
    clearInterval(tickTimer)
    tickTimer = null
  }
}

// ---------- scene builders ----------
function buildDateLine(o, level, x0, withHr) {
  o.week = create(ui.widget.IMG, { x: x0, y: 402, src: img('date/w1'), show_level: level })
  o.day = create(ui.widget.TEXT_IMG, {
    x: x0 + 56, y: 402, w: 32, h: 28,
    font_array: digits('amber'), text: '1', h_space: 1,
    align_h: ui.align.CENTER_H, show_level: level,
  })
  o.month = create(ui.widget.IMG, { x: x0 + 94, y: 402, src: img('date/m1'), show_level: level })
  if (withHr) {
    create(ui.widget.TEXT_IMG, {
      x: x0 + 182, y: 402, w: 48, h: 28,
      font_array: digits('amber'), type: ui.data_type.HEART,
      invalid_image: img('amber/none'), h_space: 1,
      align_h: ui.align.LEFT, show_level: level,
    })
  }
}

function buildGear(o, level) {
  o.gear0 = create(ui.widget.IMG, { x: C - 30, y: 298, src: img('gear/0'), show_level: level })
  o.gear1 = create(ui.widget.IMG, { x: C, y: 298, src: img('gear/0'), show_level: level })
}

// Warning lamps. The unlit icons are part of bg. The alarm lamp uses the
// system alarm status. Stopwatch and timer have no status, so their lamps are
// bound to the value instead.
function buildLamps(L) {
  const at = (i) => ({ x: LAMP_X[i] - 20, y: LAMP_Y - 20 })
  create(ui.widget.IMG_STATUS, { ...at(0), src: img('lamp/alarm'), type: ui.system_status.CLOCK, show_level: L })
  const lit = (name) => Array.from({ length: 100 }, (_, i) => img(i ? 'lamp/' + name : 'lamp/none'))
  // IMG_LEVEL ignores STOP_WATCH, so the stopwatch lamp is a TEXT_IMG with
  // invisible digits and the lit lamp as its unit: it shows while the stopwatch
  // holds a time (running or paused) and disappears once it is reset.
  const sw = img('lamp/stopwatch')
  create(ui.widget.TEXT_IMG, {
    x: LAMP_X[1] + 20 - 60, y: LAMP_Y - 20, w: 60, h: 40,
    font_array: digits('blank'), type: ui.data_type.STOP_WATCH,
    unit_en: sw, unit_sc: sw, unit_tc: sw, invalid_image: img('blank/0'),
    h_space: 0, align_h: ui.align.RIGHT, show_level: L,
  })
  // timer: frame 0 is empty, every other frame is the lit lamp
  create(ui.widget.IMG_LEVEL, {
    ...at(2), image_array: lit('timer'), image_length: 100,
    type: ui.data_type.COUNT_DOWN, show_level: L,
  })
}

function buildAod() {
  create(ui.widget.IMG, { x: 0, y: 0, src: img('bg_aod'), show_level: AOD })
  buildGear(wa, AOD)
  buildDateLine(wa, AOD, 161, false)
  wa.needle = rotatingImg(img('needle_aod'), 14, 210, C, C, AOD)
  create(ui.widget.IMG, { x: C - 22, y: C - 22, src: img('hub_aod'), show_level: AOD })
}

function buildNormal() {
  const L = NORMAL
  create(ui.widget.IMG, { x: 0, y: 0, src: img('bg'), show_level: L })

  // FUEL gauge (battery)
  w.fuelFill = create(ui.widget.IMG, { x: FUEL.x - 48, y: FUEL.y - 48, src: img('fuel/0'), show_level: L })
  w.fuelNeedle = rotatingImg(img('mini_needle'), 5, 40, FUEL.x, FUEL.y, L)
  create(ui.widget.TEXT_IMG, {
    x: FUEL.x - 40, y: 264, w: 80, h: 26,
    font_array: digits('small'), type: ui.data_type.BATTERY,
    unit_en: img('small/percent'), unit_sc: img('small/percent'), unit_tc: img('small/percent'),
    h_space: 1, align_h: ui.align.CENTER_H, show_level: L,
  })

  // TEMP gauge: ends show today's low (blue) and high (red); the system-bound
  // needle shows where the current temperature sits between them.
  create(ui.widget.TEXT_IMG, {
    x: TEMP.x - 58, y: 250, w: 36, h: 16,
    font_array: digits('tiny_c'), type: ui.data_type.WEATHER_LOW,
    negative_image: img('tiny_c/minus'), invalid_image: img('tiny_c/none'),
    h_space: 0, align_h: ui.align.CENTER_H, show_level: L,
  })
  create(ui.widget.TEXT_IMG, {
    x: TEMP.x + 22, y: 250, w: 36, h: 16,
    font_array: digits('tiny_h'), type: ui.data_type.WEATHER_HIGH,
    negative_image: img('tiny_h/minus'), invalid_image: img('tiny_h/none'),
    h_space: 0, align_h: ui.align.CENTER_H, show_level: L,
  })
  create(ui.widget.IMG_POINTER, {
    src: img('mini_needle'), x: 5, y: 40,
    center_x: TEMP.x, center_y: TEMP.y,
    start_angle: MINI_START, end_angle: MINI_END,
    type: ui.data_type.WEATHER_CURRENT, invalid_visible: false, show_level: L,
  })
  create(ui.widget.TEXT_IMG, {
    x: TEMP.x - 40, y: 264, w: 80, h: 26,
    font_array: digits('small'), type: ui.data_type.WEATHER_CURRENT,
    unit_en: img('small/deg'), unit_sc: img('small/deg'), unit_tc: img('small/deg'),
    negative_image: img('small/minus'), invalid_image: img('small/none'),
    h_space: 1, align_h: ui.align.CENTER_H, show_level: L,
  })

  // Alarm message line: while an alarm is set, a patch hides the RPH label and
  // the next alarm time is drawn over it.
  create(ui.widget.IMG_STATUS, {
    x: 150, y: 98, src: img('alarm_patch'),
    type: ui.system_status.CLOCK, show_level: L,
  })
  create(ui.widget.TEXT_IMG, {
    x: 150, y: 99, w: 166, h: 26,
    font_array: digits('small'), type: ui.data_type.ALARM_CLOCK,
    dot_image: img('small/colon'), invalid_image: img('lamp/none'),
    h_space: 1, align_h: ui.align.CENTER_H, show_level: L,
  })

  // shift lights
  w.lights = create(ui.widget.IMG, { x: 148, y: 130, src: img('lights/0'), show_level: L })

  buildGear(w, L)

  // ODO (steps)
  w.odo = []
  for (let i = 0; i < 6; i++) {
    w.odo.push(create(ui.widget.IMG, {
      x: C - 65 + i * 22, y: 364,
      src: img((i === 5 ? 'odo_last/' : 'odo/') + '0'), show_level: L,
    }))
  }

  buildDateLine(w, L, 120, true)
  buildLamps(L)

  // main needle + hub on top
  w.needle = rotatingImg(img('needle'), 14, 210, C, C, L)
  create(ui.widget.IMG, { x: C - 22, y: C - 22, src: img('hub'), show_level: L })
}

WatchFace({
  build() {
    isAod = getScene() === SCENE_AOD

    if (isAod) {
      safe('buildAod', buildAod)
      safe('timeAod', () => time.onPerMinute(onMinute))
      updateAll()
      return
    }

    safe('buildNormal', buildNormal)
    safe('buildAod', buildAod)
    safe('sensors', () => {
      battery = new Battery()
      step = new Step()
      battery.onChange(updateBattery)
      step.onChange(updateSteps)
    })
    safe('time', () => {
      time.onPerMinute(onMinute)
      time.onPerDay(() => safe('date', updateDate))
    })
    safe('delegate', () =>
      create(ui.widget.WIDGET_DELEGATE, {
        resume_call: () => {
          updateAll()
          startTicking()
        },
        pause_call: () => stopTicking(),
      }),
    )

    updateAll()
    startTicking()
  },

  onDestroy() {
    stopTicking()
    safe('destroy', () => {
      if (battery) battery.offChange(updateBattery)
      if (step) step.offChange(updateSteps)
    })
  },
})
