import uPlot from 'uplot'
import { chartColors } from '../../lib/chart'
import type { Reading } from '../health/ranges'

/** Single-series trend (oldest first). Colours come from the CSS tokens via chartColors. */
export function trendData(readings: Reading[]): uPlot.AlignedData {
  const s = [...readings].sort((a, b) => a.takenAt.localeCompare(b.takenAt))
  return [s.map((r) => Date.parse(r.takenAt) / 1000), s.map((r) => r.value)]
}

export function trendChart(el: HTMLElement, readings: Reading[], width: number, height = 150) {
  const c = chartColors(el)
  const axis = { stroke: c.ink2, grid: { stroke: c.sep, width: 0.5 }, ticks: { show: false } }
  return new uPlot(
    {
      width,
      height,
      legend: { show: false },
      cursor: { show: false },
      axes: [axis, axis],
      series: [{}, { stroke: c.c1, width: 2, points: { show: true } }]
    },
    trendData(readings),
    el
  )
}
