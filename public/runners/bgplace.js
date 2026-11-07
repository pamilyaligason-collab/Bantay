// Family Bantay daily check-in while the app is closed (D-138, D-149, D-150, D-151). Runs in @capacitor/background-runner's own JS engine, not the WebView:
// no DOM, no Dexie, no supabase-js. The app (src/features/family/bgPlace.ts) writes the arm state with the 'configure' event; this file only reads it.
// State: CapacitorKV 'bp.cfg' = JSON { url, key, pkey, last (ms) }. Absent = off. Nothing is sent without it (ML-46).
// `pkey` is this phone's own place key (migration 0053): it can only record this person's battery and that the phone checked in. The app's sign-in token is never given to this file.
// D-151: this file never reads the phone's position and never sends one. The plugin gives no fix age, so the run cannot prove the phone is still at the last point, and re-dating it would keep a stale place on the map.
// The place on the map only moves when the app itself takes a fix. No location permission is needed here (APK manifest: ACCESS_BACKGROUND_LOCATION is removed).
// Every handler resolves, even on failure: a rejected or unresolved run can get the runner killed.
var KEY = 'bp.cfg'
var MIN_GAP_MS = 20 * 3600 * 1000 // one check-in a day: the OS may fire a little early or twice

function readCfg() {
  try {
    var raw = CapacitorKV.get(KEY)
    var c = raw && raw.value ? JSON.parse(raw.value) : null
    return c && typeof c.url === 'string' && typeof c.key === 'string' && typeof c.pkey === 'string' && c.pkey ? c : null
  } catch (e) { return null }
}
function saveCfg(c) { try { CapacitorKV.set(KEY, JSON.stringify(c)) } catch (e) { /* storage refused: stay off */ } }
function clearCfg() { try { CapacitorKV.remove(KEY) } catch (e) { /* nothing stored */ } }

addEventListener('configure', function (resolve, reject, args) {
  try {
    var a = args || {}
    var ok = a.on === true && typeof a.url === 'string' && a.url.indexOf('https://') === 0 && typeof a.key === 'string' && a.key && typeof a.pkey === 'string' && a.pkey
    if (!ok) { clearCfg(); resolve(); return }
    var old = readCfg()
    saveCfg({ url: a.url, key: a.key, pkey: a.pkey, last: old && typeof old.last === 'number' ? old.last : 0 }) // anything else in args (a fix, a token) is dropped
    resolve()
  } catch (e) { clearCfg(); resolve() }
})

// The OS calls this about once a day (capacitor.config.ts: event dailyPlace, interval 1440). Resolves a short status word.
function dailyCheckIn() {
  var c = readCfg()
  if (!c) return Promise.resolve('off')
  var now = Date.now()
  if (typeof c.last === 'number' && c.last > 0 && now - c.last < MIN_GAP_MS) return Promise.resolve('recent')
  var pct = null
  var charging = null
  try {
    var b = CapacitorDevice.getBatteryStatus()
    if (b && typeof b.batteryLevel === 'number' && isFinite(b.batteryLevel) && b.batteryLevel >= 0 && b.batteryLevel <= 1) pct = Math.round(b.batteryLevel * 100)
    if (b && typeof b.isCharging === 'boolean') charging = b.isCharging
  } catch (e) { /* battery unknown stays null (ML-05) */ }
  return fetch(c.url + '/rest/v1/rpc/live_location_put_device', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: c.key }, // the publishable key names the project; the place key is the only credential
    body: JSON.stringify({ p_key: c.pkey, p_battery_pct: pct, p_charging: charging })
  }).then(function (res) {
    if (res.status === 404) { clearCfg(); return 'off' } // the function is gone (migration 0053 undone): stop at once; the app re-arms at its next open if it comes back
    if (!res.ok) return 'failed' // 53400 and server errors: keep the key, try tomorrow
    return Promise.resolve(res.json()).then(function (ok) {
      if (ok === false) { clearCfg(); return 'off' } // the server did not accept the key (revoked, switched off, expired): stop at once
      c.last = now
      saveCfg(c)
      return 'ok'
    }, function () { return 'failed' })
  }).catch(function () { return 'failed' })
}

addEventListener('dailyPlace', function (resolve) {
  try { dailyCheckIn().then(function () { resolve() }, function () { resolve() }) } catch (e) { resolve() }
})
