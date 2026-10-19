/**
 * Where each part of content.json sits on the shared body frame of /anatomy/body.svg.
 * Frame units: the body is 306 tall (top at y=2), the spine runs near x=60, the viewBox is -20 0 140 310.
 * Each [x, y] is one tap spot (two for paired parts). Artwork is licensed vector art, see docs/ASSETS.md.
 */
export const HITS: Record<string, [number, number][]> = {
  // Skeleton
  skull: [[60, 18]],
  spine: [[60, 112]],
  ribs: [[40, 80], [80, 80]],
  armbones: [[14, 118], [105, 118]],
  pelvis: [[60, 150]],
  legbones: [[44, 215], [76, 215]],
  // Muscles (the muscle figure is centred on x=50)
  neckshoulder: [[32, 58], [68, 58]],
  chest: [[50, 80]],
  core: [[50, 112]],
  upperarm: [[22, 98], [78, 98]],
  thigh: [[37, 182], [63, 182]],
  calf: [[38, 240], [62, 240]],
  // Heart and blood
  heartorgan: [[64, 88]],
  vessels: [[60, 52], [22, 128], [58, 215]],
  // Lungs
  lungorgan: [[46, 82], [74, 82]],
  windpipe: [[60, 58]],
  // Brain and nerves
  brainorgan: [[60, 24]],
  cord: [[60, 105]],
  nerves: [[37, 88], [83, 88], [52, 225]],
  // Digestion
  stomach: [[72, 110]],
  liver: [[47, 108]],
  smallbowel: [[60, 132]],
  largebowel: [[84, 134], [60, 158]],
  // Kidneys and bladder
  kidneyorgan: [[47, 121], [72, 118]],
  bladderorgan: [[59, 172]],
  // Skin
  skinorgan: [[60, 118]],
  hairnails: [[47, 80], [60, 8]],
  // Hormones
  pituitary: [[58, 26]],
  thyroid: [[60, 52]],
  pancreas: [[68, 132]],
  adrenals: [[54, 110], [70, 109]]
}

/** Visible window per system on the shared frame: [x, y, width, height]. */
export const VIEW: Record<string, [number, number, number, number]> = {
  skeleton: [-20, 0, 140, 310],
  muscles: [-20, 0, 140, 310],
  heart: [-20, 0, 140, 260],
  lungs: [0, 30, 120, 110],
  brain: [-20, 0, 140, 250],
  digestion: [5, 50, 110, 130],
  kidneys: [5, 85, 110, 110],
  skin: [-20, 0, 140, 190],
  hormones: [0, 0, 120, 160]
}

/** Layers that draw their own body, so the shared outline stays hidden. */
export const OWN_BODY = new Set(['skeleton', 'muscles'])

/** Art in /anatomy/body.svg is one <g id> per system, plus #body. */
export const SPRITE = '/anatomy/body.svg'
