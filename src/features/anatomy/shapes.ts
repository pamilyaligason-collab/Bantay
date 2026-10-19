/** Where each part of content.json is drawn on the 100 x 310 body. `sym` parts are drawn again mirrored. Hit points are the tap spots. */
export interface Shape { sym?: boolean; fill?: string[]; line?: string[]; w?: number; dash?: string; hits: [number, number][] }

const ribs = [58, 66, 74, 82, 90].map((y) => `M51 ${y}C62 ${y - 3} 71 ${y} 72 ${y + 8}`)

export const SHAPES: Record<string, Shape> = {
  // Skeleton
  skull: { fill: ['M50 3C58 3 63 9 63 18C63 24 60 28 56 31L56 34H44L44 31C40 28 37 24 37 18C37 9 42 3 50 3Z'], hits: [[50, 17]] },
  spine: { line: ['M50 40V152'], w: 3.2, dash: '3 1.6', hits: [[50, 100]] },
  ribs: { sym: true, line: [...ribs, 'M50 54V92'], w: 2, hits: [[62, 74]] },
  armbones: { sym: true, line: ['M80 64L84 108', 'M84 110L89 152'], w: 3.4, hits: [[84, 96], [88, 136]] },
  pelvis: { fill: ['M33 132C30 142 36 154 46 162L50 158L54 162C64 154 70 142 67 132C60 136 55 134 50 136C45 134 40 136 33 132Z'], hits: [[50, 148]] },
  legbones: { sym: true, line: ['M58 162L63 214', 'M63 222L61 292'], w: 3.6, hits: [[60, 188], [62, 258]] },
  // Muscles
  neckshoulder: { sym: true, fill: ['M56 42C62 46 70 48 76 52C80 54 82 60 82 66C76 62 70 58 62 55Z'], hits: [[70, 54]] },
  chest: { sym: true, fill: ['M51 62C58 58 68 60 73 66C72 76 68 82 60 84C54 84 51 80 51 74Z'], hits: [[62, 72]] },
  core: { fill: ['M43 92H57V126C57 130 54 134 50 134C46 134 43 130 43 126Z'], line: ['M50 92V132', 'M43 104H57', 'M43 116H57'], w: 1, hits: [[50, 112]] },
  upperarm: { sym: true, fill: ['M79 68C84 70 87 86 87 106C83 108 79 100 78 88Z'], hits: [[83, 88]] },
  thigh: { sym: true, fill: ['M54 164C60 160 70 160 74 166C75 185 73 205 70 214C64 216 58 216 56 212C56 192 55 178 54 164Z'], hits: [[64, 190]] },
  calf: { sym: true, fill: ['M58 232C64 228 69 230 70 236C70 250 68 262 66 272C62 272 58 262 57 250Z'], hits: [[64, 252]] },
  // Heart and blood
  heartorgan: { fill: ['M58 90C50 83 48 77 48 73C48 69 51 67 54 67C56 67 57.5 68.5 58 70C58.5 68.5 60 67 62 67C65 67 68 69 68 73C68 77 66 83 58 90Z'], hits: [[58, 79]] },
  vessels: { line: ['M51 47V68', 'M54 90V148L46 164', 'M54 148L62 164', 'M62 66C70 62 77 64 80 70L84 108L88 150', 'M38 66C30 62 23 64 20 70L16 108L12 150'], w: 2.2, hits: [[51, 56], [54, 124], [84, 92], [16, 92]] },
  // Lungs
  lungorgan: { sym: true, fill: ['M48 56C44 54 36 58 34 70C32 82 34 92 40 94C46 94 48 90 48 84Z'], hits: [[41, 76]] },
  windpipe: { line: ['M50 38V58', 'M50 58L42 66', 'M50 58L58 66'], w: 3, hits: [[50, 48]] },
  // Brain and nerves
  brainorgan: { fill: ['M50 6C58 6 61 12 60 18C60 22 57 25 54 25C52 27 48 27 46 25C43 25 40 22 40 18C39 12 42 6 50 6Z'], line: ['M50 7V24'], w: 0.8, hits: [[50, 15]] },
  cord: { line: ['M50 36V150', 'M50 150L46 160', 'M50 150L54 160'], w: 1.8, hits: [[50, 100]] },
  nerves: { sym: true, line: ['M50 60C60 56 72 58 78 68L82 100L86 134L90 154', 'M50 150C54 170 58 200 60 230L60 292'], w: 1.6, hits: [[80, 92], [58, 200]] },
  // Digestion
  stomach: { fill: ['M56 84C64 80 70 84 70 92C70 102 63 106 58 104C54 102 56 96 56 92Z'], hits: [[63, 93]] },
  liver: { fill: ['M32 86C40 82 52 84 56 86C56 94 52 100 44 100C38 100 33 94 32 86Z'], hits: [[44, 92]] },
  smallbowel: { line: ['M44 110H56C60 112 60 116 56 118H44C40 120 40 124 44 126H56C60 128 60 132 56 134H44'], w: 4, hits: [[50, 126]] },
  largebowel: { line: ['M37 140V108H63V140C63 146 57 146 55 142'], w: 4, hits: [[36, 112], [64, 112]] },
  // Kidneys and bladder
  kidneyorgan: { sym: true, fill: ['M43 108C38 106 35 112 36 118C37 125 41 128 44 126C46 123 44 117 45 113C45 110 44 108 43 108Z'], line: ['M44 127C45 132 46 137 48 141'], w: 1.4, hits: [[41, 117]] },
  bladderorgan: { fill: ['M50 140C57 140 60 145 58 150C56 155 44 155 42 150C40 145 43 140 50 140Z'], hits: [[50, 147]] },
  // Skin: the whole body is the tap target (see Explorer)
  skinorgan: { hits: [[50, 130]] },
  hairnails: { sym: true, fill: ['M37 18C37 6 43 1 50 1C57 1 63 6 63 18C60 12 56 9 50 9C44 9 40 12 37 18Z', 'M88 175h5v4h-5z', 'M64 305h6v3h-6z'], hits: [[50, 7], [90, 170], [64, 300]] },
  // Hormones
  pituitary: { fill: ['M48 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0'], hits: [[50, 20]] },
  thyroid: { fill: ['M50 41C46 39 42 41 43 46C45 49 48 48 50 46C52 48 55 49 57 46C58 41 54 39 50 41Z'], hits: [[50, 46]] },
  pancreas: { fill: ['M40 98C48 93 62 93 70 96C70 101 62 103 54 102C48 102 43 102 40 98Z'], hits: [[54, 97]] },
  adrenals: { sym: true, fill: ['M38 100C40 98 44 99 45 102L38 104Z'], hits: [[38, 103]] }
}

/** Vertical crop (y0, height) per system, so organs are big enough to tap. */
export const VIEW: Record<string, [number, number]> = {
  skeleton: [0, 310], muscles: [30, 280], heart: [30, 140], lungs: [30, 80], brain: [0, 170],
  digestion: [76, 80], kidneys: [92, 76], skin: [0, 310], hormones: [0, 125]
}
