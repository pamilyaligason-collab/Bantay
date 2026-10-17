import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'

const read = (s: CSSStyleDeclaration, name: string) => s.getPropertyValue(name).trim()

/** Chart colours come from the CSS tokens so light, dark and [data-theme] all work. */
export function chartColors(el: Element = document.documentElement) {
  const s = getComputedStyle(el)
  return { c1: read(s, '--c1'), c2: read(s, '--c2'), ink2: read(s, '--ink2'), sep: read(s, '--sep'), cell: read(s, '--cell') }
}

/** Two-series line chart (data = [x, top, bottom]); series 1 uses --c1, series 2 uses --c2.
 *  ponytail: colours are read once at creation; call again after a theme change. */
export function lineChart(el: HTMLElement, data: uPlot.AlignedData, width: number, height = 150) {
  const c = chartColors(el)
  const axis = { stroke: c.ink2, grid: { stroke: c.sep, width: 0.5 }, ticks: { show: false } }
  return new uPlot(
    {
      width,
      height,
      legend: { show: false },
      cursor: { show: false },
      axes: [axis, axis],
      series: [{}, { stroke: c.c1, width: 2 }, { stroke: c.c2, width: 2 }]
    },
    data,
    el
  )
}
