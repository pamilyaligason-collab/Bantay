import { useEffect, useState, type ReactNode } from 'react'
import { AllPrices } from './AllPrices'
import { PlantPoster } from './Plant'

/** Today's sub-pages: #garden/plant (poster page) and #garden/prices (all DA prices). null on every other hash. Today shows the node instead of itself. */
export function useGardenPage(): ReactNode | null {
  const [h, setH] = useState(() => location.hash)
  useEffect(() => {
    const on = () => setH(location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  useEffect(() => { if (h === '#garden/plant' || h === '#garden/prices') document.querySelector('main.scroll')?.scrollTo(0, 0) }, [h])
  return h === '#garden/plant' ? <PlantPoster /> : h === '#garden/prices' ? <AllPrices /> : null
}
