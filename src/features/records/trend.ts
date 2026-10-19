import uPlot from 'uplot'
import { chartColors } from '../../lib/chart'
import type { Reading } from '../health/ranges'

/** Single-series trend (oldest first). Colours come from the CSS tokens via chartColors. */
export function trendData(readings: Reading[]): uPlot.AlignedData {
  const s = [...readings].sort((a, b) => a.takenAt.localeCompare(b.takenAt))
  return [s.map((r) => Date.parse(r.takenAt) / 1000), s.map((r) => r.value)]
}

const DAY = 86_400
/** x range from the data itself, padded a little (at least 3 days), so one 2026 point never draws a 2027-2029 axis. */
export function xRange(min: number, max: number): [number, number] {
  const pad = Math.max((max - min) * 0.08, 3 * DAY)
  return [min - pad, max + pad]
}

export function trendChart(el: HTMLElement, readings: Reading[], width: number, height = 150) {
  const c = chartColors(el)
  const data = trendData(readings)
  const xs = data[0] as number[]
  const [x0, x1] = xRange(xs[0] ?? 0, xs[xs.length - 1] ?? 0)
  const css = getComputedStyle(el)
  const line = css.getPropertyValue('--green2').trim() || c.c1 // v6 green; the shared blue pair is off-palette here
  const axis = { stroke: c.ink2, font: '13px system-ui, sans-serif', grid: { stroke: c.sep, width: 0.5 }, ticks: { show: false } }
  return new uPlot(
    {
      width,
      height,
      legend: { show: false },
      cursor: { show: false },
      scales: { x: { time: true, auto: false, min: x0, max: x1 } }, // fixed: uPlot's own pad for one point spans years
      axes: [axis, axis],
      series: [{}, { stroke: line, width: 2, points: { show: true, size: 8, fill: line, stroke: c.cell, width: 2 } }]
    },
    data,
    el
  )
}
