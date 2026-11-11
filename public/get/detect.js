/* Platform detection and the Android "open the app, else download it" link for /get (S31 L1).
   Plain ES5, no dependencies: the page loads it with <script src="detect.js">, vitest loads it too (it hangs BantayGet on the global). */
(function (root) {
  var APP_LINK = 'ph.bantay.family://setup'
  var GH = /^https:\/\/github\.com\/pamilyaligason-collab\/Bantay\/releases\/download\/[^/]+\/[^/]+\.apk$/
  var APK_LATEST = 'https://github.com/pamilyaligason-collab/Bantay/releases/latest/download/bantay.apk'

  /** 'app' = already inside Bantay (its webview or the installed web app); else the phone kind. iPadOS Safari sends a Mac user agent, so it is told apart by touch points. */
  function platform(ua, touchPoints, o) {
    o = o || {}
    if (o.native || o.standalone) return 'app'
    if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1)) return 'ios'
    if (/Android/.test(ua)) return 'android'
    return 'desktop'
  }

  /** Messenger, Facebook, Instagram and Line open links in their own browser, where the app cannot be opened or the file saved. */
  function inAppBrowser(ua) { return /FBAN|FBAV|Messenger|Instagram|Line\//.test(ua) }

  /** The APK address Chrome falls back to: the one in latest.json when it is the family's GitHub release file, else the latest-release link. */
  function apkUrl(latest) { return latest && typeof latest.url === 'string' && GH.test(latest.url) ? latest.url : APK_LATEST }

  /** Chrome intent link: opens the installed app at ph.bantay.family://setup; with no app installed Chrome goes to the fallback address, which starts the download. */
  function intentUrl(apk) {
    return 'intent://setup#Intent;scheme=ph.bantay.family;package=ph.bantay.family;S.browser_fallback_url=' + encodeURIComponent(apk) + ';end'
  }

  root.BantayGet = { APP_LINK: APP_LINK, APK_LATEST: APK_LATEST, platform: platform, inAppBrowser: inAppBrowser, apkUrl: apkUrl, intentUrl: intentUrl }
})(typeof self !== 'undefined' ? self : globalThis)
