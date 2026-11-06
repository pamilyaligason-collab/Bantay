import { useState } from 'react'
import type { Recipe } from './data'
import '../today.css' // .dc-rphoto and .dc-credit live here; a deep link to Recipes does not load Overview

/** The recipe picture with its credit line (Wikimedia Commons). Only the words "Photo: author, licence" are the link to the file page; in a card the line sits at the bottom edge (CSS order), clear of the card's main tap area. No picture, or it cannot load: a coloured tile with the dish's first letter and no credit line. */
export function RecipePhoto({ r }: { r: Pick<Recipe, 'name' | 'image'> }) {
  const [bad, setBad] = useState(false)
  const im = r.image
  if (!im || bad) return <span className="dc-rphoto" data-fallback="true"><span className="nw-mark" aria-hidden="true">{r.name.charAt(0).toUpperCase()}</span></span>
  return (
    <>
      <span className="dc-rphoto"><img src={im.url} alt="" width={500} height={375} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setBad(true)} /></span>
      <span className="dc-credit"><a href={im.sourceUrl} target="_blank" rel="noopener noreferrer">Photo: {im.credit}, {im.licence}<span className="dc-sr"> on Wikimedia Commons (opens outside)</span></a></span>
    </>
  )
}
