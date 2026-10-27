# Firebase setup and live check for push to the APK (session 12, lane E, APK 2.4.0)

Family alerts reach the Android app through Firebase Cloud Messaging (FCM). This needs a one-time setup that only Lloyd can do (about 40 minutes), then a live check on two phones. Nothing here is a secret in the repo: the two key files stay on Lloyd's PC and in GitHub and Supabase secrets.

Until this is done the app still works: it shows family alerts when it is open, as in 2.3.0. Without `FIREBASE_SERVICE_ACCOUNT_B64` the `dose-watch` and `broadcast` functions send web push only.

## Setup (once)
1. Firebase console (console.firebase.google.com): Add project "Family Bantay" (Google Analytics off). Add app, Android, package `ph.bantay.family`, nickname "Bantay APK". Download `google-services.json`.
2. Put the file at `android/app/google-services.json` on the PC. It is git-ignored. `android/app/build.gradle` applies the google-services plugin when the file exists, and `android/build.gradle` already has `classpath 'com.google.gms:google-services:4.4.4'`.
3. GitHub repo, Settings, Secrets and variables, Actions, New secret `GOOGLE_SERVICES_JSON_BASE64` = the file as base64:
   `[Convert]::ToBase64String([IO.File]::ReadAllBytes('android\app\google-services.json'))`
4. Firebase, Project settings, Service accounts, Generate new private key (JSON). Then:
   `npx -y supabase@2.122.0 secrets set FIREBASE_SERVICE_ACCOUNT_B64=<base64 of that JSON>`
   Keep the JSON offline. Never put it in the repo or paste it in chat.
5. Google Cloud console (same project), APIs: confirm "Firebase Cloud Messaging API (V1)" is enabled (it is on by default for new projects).

After the secret is set, deploy the functions again so they read it: `dose-watch` and `broadcast`. Both also bundle `_shared/fcm.ts` and `_shared/templates.ts`.

## What gets built
- `scripts/release-apk.ps1` stops with a clear message if `android\app\google-services.json` is missing or has no app `ph.bantay.family`.
- The GitHub workflow "Release Android app" writes the file from `GOOGLE_SERVICES_JSON_BASE64` before `cap sync`, checks it, and fails if the secret is missing. It deletes the file at the end.
- After a local build, run `node scripts/check-manifest.mjs <merged manifest>` (see `docs/NATIVE.md`). It checks the four read-only health permissions, `POST_NOTIFICATIONS` and the FCM receiver.

## Live check (after the migration `0040` and the functions are live, on two real phones)
Phone 1 = any member. Phone 2 = a carer of that member, signed in on APK 2.4.0 and notifications allowed.
1. **Token saved.** In the Supabase SQL editor: `select user_id, platform, app_version, updated_at from push_tokens;` shows one row for phone 2's user. If Me shows "Alerts are off on this phone", tap Open settings and allow notifications, come back, and run the query again.
2. **Alert arrives with the app closed.** On phone 2 swipe Bantay away from recents (do NOT use Force stop). On phone 1 tap Unwell on Today. Within about a minute phone 2 shows a notification with only the template words ("Someone is not feeling well"), no name. Check:
   `select kind, template, pushed_at, seen_at from carer_alerts where kind = 'mood_unwell' order by created_at desc limit 1;` (`pushed_at` is set) and
   `select summary->>'fcmPushed' from job_runs where job = 'dose-watch' order by ran_at desc limit 1;` (1 or more).
3. **After a reboot.** Restart phone 2, do not open Bantay, tap Unwell again on phone 1. The notification must arrive. If it does not on Oppo, Vivo or Xiaomi, turn on auto-start for Bantay (Settings, Apps, Bantay, Auto-start) and try again. This is the known limit of those phones.
4. **Quiet hours.** Between 22:00 and 06:00 Manila a normal alert (for example a new family summary) arrives silently. Unwell and SOS still ring.
5. **Broadcast.** In /admin send the `heat_alert` broadcast. The reply shows `fcmSent` of 1 or more.
6. **Sign out.** Sign out on phone 2. `select count(*) from push_tokens where user_id = '<phone 2 user id>';` is 0 (or phone 2 signs in as someone else and the old row is gone). Trigger Unwell on phone 1: phone 2 shows nothing.

**Not part of the check:** an app that was force-stopped gets no push until it is opened again. That is Android, not a bug.

## If something is wrong
- Check 1 shows no row: the app could not register. Is `google-services.json` in the build (the release script and workflow insist on it)? Is Google Play services on the phone? Is the permission allowed?
- Check 1 has a row but check 2 shows nothing: `select summary from job_runs where job = 'dose-watch' order by ran_at desc limit 1;` If `fcmPushed` is 0, check that `FIREBASE_SERVICE_ACCOUNT_B64` is set (`npx -y supabase@2.122.0 secrets list` shows its name only) and that the functions were deployed after it was set.
- A token that Google says is gone (404 or 410) is deleted by the next push. A token Google refuses five times (400 or 403) is pruned by the next cleanup run (`dose_watch_prune`, every 15 minutes); the app registers a new one the next time it opens.
