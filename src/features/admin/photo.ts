/** Largest centred square of a w x h picture. */
export function squareCrop(w: number, h: number): { sx: number; sy: number; side: number } {
  const side = Math.min(w, h)
  return { sx: Math.floor((w - side) / 2), sy: Math.floor((h - side) / 2), side }
}

/** Picture from the camera or gallery -> 512 x 512 JPEG (centre square). Null when the file is not a readable picture. */
export async function toAvatarJpeg(file: Blob, size = 512): Promise<Blob | null> {
  try {
    const bmp = await createImageBitmap(file) // honours EXIF rotation in current WebViews
    const { sx, sy, side } = squareCrop(bmp.width, bmp.height)
    const c = document.createElement('canvas')
    c.width = c.height = Math.min(size, side) // never blow a small picture up
    c.getContext('2d')!.drawImage(bmp, sx, sy, side, side, 0, 0, c.width, c.height)
    bmp.close?.()
    return await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/jpeg', 0.85))
  } catch { return null }
}
