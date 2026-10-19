/** GSAP loads on demand so it stays out of the main bundle (own chunk). */
export const loadGsap = () => import('gsap').then(m => m.gsap)
