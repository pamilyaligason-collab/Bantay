import { useState } from 'react'
import type { Recipe } from './data'

/** The recipe picture with its credit line underneath (Wikimedia Commons: author, licence, link to the file page). No picture, or it cannot load: a coloured tile with the dish's first letter and no credit line. */
export function RecipePhoto({ r }: { r: Pick<Recipe, 'name' | 'image'> }) {
  const [bad, setBad] = useState(false)
  const im = r.image
  if (!im || bad) return <span className="dc-rphoto" data-fallback="true"><span className="nw-mark" aria-hidden="true">{r.name.charAt(0).toUpperCase()}</span></span>
  return (
    <>
      <span className="dc-rphoto"><img src={im.url} alt="" width={500} height={375} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setBad(true)} /></span>
      <span className="dc-credit">Photo: {im.credit}, {im.licence}, <a href={im.sourceUrl} target="_blank" rel="noopener noreferrer">Wikimedia Commons<span className="dc-sr"> (opens outside)</span></a></span>
    </>
  )
}
