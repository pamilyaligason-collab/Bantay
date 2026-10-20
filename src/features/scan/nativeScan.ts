// The Android app's own scanner (Google ML Kit document scanner, via @capacitor-mlkit/document-scanner): edge detection, crop and
// clean-up all happen on the phone. The browser, and an app built before the plugin was added, use the camera input + crop screen.
import { Capacitor } from '@capacitor/core'

export const PAGE_LIMIT = 10

/** 'native' only inside the Android app AND when this build of it contains the plugin. Old APKs answer 'web'. */
export function scannerKind(): 'native' | 'web' {
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('DocumentScanner') ? 'native' : 'web'
  } catch { return 'web' }
}

/** Scanner screen, then each page as a JPEG Blob in page order. [] when the person backed out. Throws when the scanner cannot run. */
export async function scanNative(): Promise<Blob[]> {
  const { DocumentScanner } = await import('@capacitor-mlkit/document-scanner') // dynamic: the web bundle does not carry it
  let r
  try {
    r = await DocumentScanner.scanDocument({ pageLimit: PAGE_LIMIT, galleryImportAllowed: true, resultFormats: 'JPEG', scannerMode: 'FULL' })
  } catch (e) {
    if (/cancel/i.test((e as Error)?.message ?? '')) return [] // closing the scanner is not an error
    throw e
  }
  const out: Blob[] = []
  for (const uri of r.scannedImages ?? []) {
    const res = await fetch(Capacitor.convertFileSrc(uri))
    const b = await res.blob()
    out.push(b.type === 'image/jpeg' ? b : new Blob([b], { type: 'image/jpeg' }))
  }
  return out
}
