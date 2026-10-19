const fs = require('fs'); const path = require('path')
const J = (n) => JSON.parse(fs.readFileSync(path.join('..', 'j', n + '.json'), 'utf8'))
const skel = J('Human_skeleton_front_no-text_no-color')
const sk = skel.items.filter((i) => i.tag !== 'rect' && i.fill)
const sb = sk.reduce((b, it) => [Math.min(b[0], it.bbox[0]), Math.min(b[1], it.bbox[1]), Math.max(b[2], it.bbox[2]), Math.max(b[3], it.bbox[3])], [1e9, 1e9, -1e9, -1e9])
console.error('skeleton fig bbox', sb.map(Math.round).join(','))
const K0 = 306 / 790
const mir = (d) => d
const none = () => true
const layers = [
  // shared body outline (circulatory silhouette)
  { id: 'body', src: 'circ', keep: (it) => it.labels[0] === 'Silhouette' && it.i === 0, k: K0, from: [211, 15], to: [60, 2], style: () => ({ fill: 'bd', stroke: 'bo', sw: 1.3 }), prec: 1 },
  // heart and blood: all vessels and the heart
  { id: 'heart', src: 'circ', keep: (it) => it.labels[0] !== 'Silhouette' && it.labels[0] !== 'Hide', k: K0, from: [211, 15], to: [60, 2], blue: true, th: [0.2, 0.42, 0.7, 0.88], prec: 1, minArea: +(process.env.HA||0.05) },
  ...((fs.existsSync('tr_skeleton.frag') && !process.env.FULL) ? [{ id: 'skeleton', raw: fs.readFileSync('tr_skeleton.frag', 'utf8') }] : []),
  ...((fs.existsSync('tr_skeleton.frag') && !process.env.FULL) ? [] : [{ id: 'skeleton', src: 'skel', keep: (it) => it.tag !== 'rect' && it.fill, k: 306 / (sb[3] - sb[1]), from: [210, sb[1]], to: [60, 2], th: [0.3, 0.55, 0.78, 0.92], prec: 1, minArea: +(process.env.MA||0.02) }]),
  { id: 'muscles', raw: fs.readFileSync('tr_muscles.frag', 'utf8') },
  { id: 'lungs', src: 'resp', keep: (it) => [4, 5, 10, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84].includes(it.i), k: 0.115, from: [365, 383], to: [60, 58], th: [0.2, 0.42, 0.65, 0.85], prec: 1 },
  { id: 'lungs', src: 'resp', keep: (it) => it.i === 118 || it.i === 119, k: 0.115, from: [365, 383], to: [60, 58], th: [0.2, 0.42, 0.65, 0.85], prec: 1 },
  { id: 'digestion', src: 'dig', keep: (it) => it.fill && it.bbox[0] >= 222 && (it.i <= 65 || it.bbox[1] >= 320), k: 0.22, ky: 0.165, from: [335, 465], to: [60, 100], prec: 1, th: [0.25, 0.5, 0.72, 0.88] },
  { id: 'kidneys', src: 'uri', keep: (it) => [1, 4, 5, 6, 7, 15, 16, 34, 35, 36, 37].includes(it.i), k: 0.38, from: [90.5, 64], to: [60, 106], prec: 1, th: [0.2, 0.42, 0.65, 0.85] },
  { id: 'brain', src: 'brain', keep: (it) => it.i <= 67, k: 0.06, from: [508, 343], to: [60, 26], prec: 1, th: [0.3, 0.6, 0.8, 0.93] },
  {
    id: 'brain', raw: '<g transform="translate(10 0)" style="fill:none;stroke-linecap:round;stroke-linejoin:round"><path d="M50 40C50.8 70 49.2 110 50 150M50 150C48 156 47 160 46 166M50 150C52 156 53 160 54 166" style="stroke:var(--a1);stroke-width:2.4"/>' +
      '<path d="M50 56C42 54 34 56 30 64C27 80 25 100 20 132C18 142 17 150 16 160M50 56C58 54 66 56 70 64C73 80 75 100 80 132C82 142 83 150 84 160M50 150C47 175 44 205 42 245C41 265 40 285 40 300M50 150C53 175 56 205 58 245C59 265 60 285 60 300" style="stroke:var(--a2);stroke-width:1.1"/></g>'
  },
  { id: 'skin', src: 'skin', keep: (it) => it.i <= 26, k: 0.28, from: [197, 185], to: [60, 102], prec: 1, th: [0.3, 0.55, 0.75, 0.9] },
  { id: 'hormones', src: 'endo', keep: (it) => it.i >= 2 && it.i <= 27, k: 0.17, from: [406, 145], to: [60, 18], prec: 1, th: [0.3, 0.55, 0.75, 0.9] },
  { id: 'hormones', src: 'endo', keep: (it) => it.i >= 29 && it.i <= 35, k: 0.17, from: [386, 350], to: [60, 53], prec: 1, th: [0.3, 0.55, 0.75, 0.9] },
  { id: 'hormones', src: 'dig', keep: (it) => it.i === 9, k: 0.22, ky: 0.165, from: [335, 465], to: [60, 112], prec: 1, th: [0.3, 0.55, 0.75, 0.9] },
  { id: 'hormones', src: 'uri', keep: (it) => it.i === 5 || it.i === 7, k: 0.38, from: [90.5, 64], to: [60, 106], prec: 1, th: [0.3, 0.55, 0.75, 0.9] }
]
module.exports = { layers }
