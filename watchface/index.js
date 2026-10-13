/**
 * REDLINE — tachometer watch face for Amazfit Active 3 Premium (466×466 round)
 *
 * The big needle is a rev counter for the current hour: it sweeps 0→60 minutes
 * over a 270° scale (0 = bottom-left, 60 = bottom-right) and "redlines" in the
 * last 10 minutes. One rotation per hour → RPH.
 *   GEAR box  = hour        Shift lights = one LED per 10 s of the minute
 *   FUEL      = battery     TEMP         = current weather temperature
 *   ODO       = steps       bottom line  = date + heart rate
 */
import ui from '@zos/ui'
import { getScene, SCENE_AOD } from '@zos/app'
import { Time, Battery, Step } from '@zos/sensor'

// ---------- layout (466 design px) ----------
const C = 233
const SCALE_START = -135 // degrees, 12 o'clock = 0, clockwise
const SCALE_SWEEP = 270
const FUEL = { x: 128, y: 238 }
const TEMP = { x: 338, y: 238 }
const MINI_START = -110
const MINI_END = 110

const NORMAL = ui.show_level.ONLY_NORMAL
const AOD = ui.show_level.ONAL_AOD
const BOTH = NORMAL | AOD

const img = (p) => 'images/' + p + '.png'
const digits = (dir) => Array.from({ length: 10 }, (_, i) => img(dir + '/' + i))
const pad2 = (n) => (n < 10 ? '0' : '') + n

// ---------- state ----------
let isAod = false
let tickTimer = null
const last = {} // cache to avoid redundant redraws
const w = {} // widgets

const time = new Time()
const battery = new Battery()
const step = new Step()

function set(widget, key, prop, value) {
  if (last[key] === value) return
  last[key] = value
  widget.setProperty(prop, value)
}

function create(type, opts) {
  return ui.createWidget(type, opts)
}

// Full-screen rotating image whose pivot (px, py inside the image) sits on (cx, cy)
function rotatingImg(src, px, py, cx, cy, level) {
  return create(ui.widget.IMG, {
    x: 0,
    y: 0,
    w: 466,
    h: 466,
    pos_x: cx - px,
    pos_y: cy - py,
    center_x: cx,
    center_y: cy,
    src: src,
    angle: 0,
    show_level: level,
  })
}

// ---------- updates ----------
function updateNeedle() {
  const m = time.getMinutes()
  const s = isAod ? 0 : time.getSeconds()
  const a = Math.round((SCALE_START + (SCALE_SWEEP * (m + s / 60)) / 60) * 10) / 10
  set(w.needle, 'needle', ui.prop.ANGLE, a)
  set(w.needleAod, 'needleAod', ui.prop.ANGLE, Math.round(SCALE_START + (SCALE_SWEEP * m) / 60))
}

function updateGear() {
  const h = pad2(time.getHours())
  set(w.gear0, 'gear0', ui.prop.SRC, img('gear/' + h[0]))
  set(w.gear1, 'gear1', ui.prop.SRC, img('gear/' + h[1]))
}

function updateLights(halfTick) {
  const s = time.getSeconds()
  let n = Math.floor(s / 10) + 1 // 1..6 → which 10-second block we're in
  if (s >= 57) n = halfTick ? 0 : 6 // flash before the minute rolls over
  set(w.lights, 'lights', ui.prop.SRC, img('lights/' + n))
}

function updateDate() {
  const wd = time.getDay() // 1 = Monday
  const mo = time.getMonth() // 1..12
  const d = String(time.getDate())
  set(w.week, 'week', ui.prop.SRC, img('date/w' + wd))
  set(w.month, 'month', ui.prop.SRC, img('date/m' + mo))
  set(w.day, 'day', ui.prop.TEXT, d)
  set(w.weekAod, 'weekAod', ui.prop.SRC, img('date/w' + wd))
  set(w.monthAod, 'monthAod', ui.prop.SRC, img('date/m' + mo))
  set(w.dayAod, 'dayAod', ui.prop.TEXT, d)
}

function updateBattery() {
  const b = Math.max(0, Math.min(100, battery.getCurrent()))
  set(w.fuelFill, 'fuelFill', ui.prop.SRC, img('fuel/' + Math.round(b / 5)))
  set(w.fuelNeedle, 'fuelNeedle', ui.prop.ANGLE, Math.round(MINI_START + ((MINI_END - MINI_START) * b) / 100))
}

function updateSteps() {
  const str = String(Math.min(999999, step.getCurrent() || 0)).padStart(6, '0')
  for (let i = 0; i < 6; i++) {
    set(w.odo[i], 'odo' + i, ui.prop.SRC, img((i === 5 ? 'odo_last/' : 'odo/') + str[i]))
  }
}

function onMinute() {
  updateNeedle()
  updateGear()
}

function updateAll() {
  onMinute()
  updateDate()
  updateBattery()
  updateSteps()
  if (!isAod) updateLights(false)
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

WatchFace({
  build() {
    isAod = getScene() === SCENE_AOD

    // --- backgrounds ---
    create(ui.widget.IMG, { x: 0, y: 0, src: img('bg'), show_level: NORMAL })
    create(ui.widget.IMG, { x: 0, y: 0, src: img('bg_aod'), show_level: AOD })

    // --- FUEL gauge (battery) ---
    w.fuelFill = create(ui.widget.IMG, { x: FUEL.x - 48, y: FUEL.y - 48, src: img('fuel/0'), show_level: NORMAL })
    w.fuelNeedle = rotatingImg(img('mini_needle'), 5, 40, FUEL.x, FUEL.y, NORMAL)
    create(ui.widget.TEXT_IMG, {
      x: FUEL.x - 40,
      y: 262,
      w: 80,
      h: 22,
      font_array: digits('small'),
      type: ui.data_type.BATTERY,
      unit_en: img('small/percent'),
      unit_sc: img('small/percent'),
      unit_tc: img('small/percent'),
      h_space: 1,
      align_h: ui.align.CENTER_H,
      show_level: NORMAL,
    })

    // --- TEMP gauge (weather, system-bound) ---
    create(ui.widget.IMG_POINTER, {
      src: img('mini_needle'),
      x: 5,
      y: 40,
      center_x: TEMP.x,
      center_y: TEMP.y,
      start_angle: MINI_START,
      end_angle: MINI_END,
      type: ui.data_type.WEATHER_CURRENT,
      invalid_visible: false,
      show_level: NORMAL,
    })
    create(ui.widget.TEXT_IMG, {
      x: TEMP.x - 40,
      y: 262,
      w: 80,
      h: 22,
      font_array: digits('small'),
      type: ui.data_type.WEATHER_CURRENT,
      unit_en: img('small/deg'),
      unit_sc: img('small/deg'),
      unit_tc: img('small/deg'),
      negative_image: img('small/minus'),
      invalid_image: img('small/none'),
      h_space: 1,
      align_h: ui.align.CENTER_H,
      show_level: NORMAL,
    })

    // --- shift lights ---
    w.lights = create(ui.widget.IMG, { x: 148, y: 130, src: img('lights/0'), show_level: NORMAL })

    // --- GEAR (hour) ---
    w.gear0 = create(ui.widget.IMG, { x: C - 30, y: 298, src: img('gear/0'), show_level: BOTH })
    w.gear1 = create(ui.widget.IMG, { x: C, y: 298, src: img('gear/0'), show_level: BOTH })

    // --- ODO (steps) ---
    w.odo = []
    for (let i = 0; i < 6; i++) {
      w.odo.push(
        create(ui.widget.IMG, {
          x: C - 65 + i * 22,
          y: 364,
          src: img((i === 5 ? 'odo_last/' : 'odo/') + '0'),
          show_level: NORMAL,
        }),
      )
    }

    // --- date + heart rate (normal) ---
    w.week = create(ui.widget.IMG, { x: 128, y: 404, src: img('date/w1'), show_level: NORMAL })
    w.day = create(ui.widget.TEXT_IMG, {
      x: 176, y: 404, w: 30, h: 24,
      font_array: digits('amber'), text: '1', h_space: 1,
      align_h: ui.align.CENTER_H, show_level: NORMAL,
    })
    w.month = create(ui.widget.IMG, { x: 208, y: 404, src: img('date/m1'), show_level: NORMAL })
    create(ui.widget.TEXT_IMG, {
      x: 294, y: 404, w: 44, h: 24,
      font_array: digits('amber'), type: ui.data_type.HEART,
      invalid_image: img('amber/none'), h_space: 1,
      align_h: ui.align.LEFT, show_level: NORMAL,
    })

    // --- date (always-on, centred) ---
    w.weekAod = create(ui.widget.IMG, { x: 169, y: 404, src: img('date/w1'), show_level: AOD })
    w.dayAod = create(ui.widget.TEXT_IMG, {
      x: 217, y: 404, w: 30, h: 24,
      font_array: digits('amber'), text: '1', h_space: 1,
      align_h: ui.align.CENTER_H, show_level: AOD,
    })
    w.monthAod = create(ui.widget.IMG, { x: 249, y: 404, src: img('date/m1'), show_level: AOD })

    // --- main needle + hub (on top) ---
    w.needle = rotatingImg(img('needle'), 14, 210, C, C, NORMAL)
    w.needleAod = rotatingImg(img('needle_aod'), 14, 210, C, C, AOD)
    create(ui.widget.IMG, { x: C - 22, y: C - 22, src: img('hub'), show_level: NORMAL })
    create(ui.widget.IMG, { x: C - 22, y: C - 22, src: img('hub_aod'), show_level: AOD })

    // --- data sources ---
    time.onPerMinute(onMinute)
    time.onPerDay(updateDate)
    battery.onChange(updateBattery)
    step.onChange(updateSteps)

    create(ui.widget.WIDGET_DELEGATE, {
      resume_call: () => {
        updateAll()
        startTicking()
      },
      pause_call: () => {
        stopTicking()
      },
    })

    updateAll()
    startTicking()
  },

  onDestroy() {
    stopTicking()
    battery.offChange(updateBattery)
    step.offChange(updateSteps)
  },
})
