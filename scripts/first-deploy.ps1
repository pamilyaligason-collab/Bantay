# Family Bantay - first deploy (Lloyd runs this once, interactively). Windows PowerShell 5.1.
# Run from the repo folder:  powershell -ExecutionPolicy Bypass -File scripts\first-deploy.ps1
# Stops at the first failure. Secrets are generated here and never printed; nothing secret is written to the repo.
# Decisions: D-15 (history already rewritten), D-16..D-23. Notes: README.md, docs/AUTH.md, docs/ASSISTANT.md.
$ErrorActionPreference = 'Stop'
if (-not $PSScriptRoot) { throw 'run as: powershell -ExecutionPolicy Bypass -File scripts\first-deploy.ps1' }
$Ref = 'wuakimpssycbtnmoexuc'
$Sb = 'supabase@2.121.0'
Set-Location (Split-Path $PSScriptRoot -Parent)
function Step($n, $t) { Write-Host "`n== Step $n. $t" -ForegroundColor Cyan }
function Check($n) { if ($LASTEXITCODE -ne 0) { throw "step $n failed (exit $LASTEXITCODE)" } }
function Pause-For($msg) { Read-Host "$msg  (press Enter when done)" | Out-Null }
function Esc($s) { $s.Replace("'", "''") }

Step 1 'Checks before push'
if (git status --porcelain) { throw 'step 1 failed: working tree not clean' }
if (git log --oneline main -- BANTAY_CLAUDE_CODE_PROMPT_v001.md) { throw 'step 1 failed: history still holds the build prompt (D-15)' }
$hits = git log -p main | Select-String -Pattern 'sk-or-v1-[A-Za-z0-9]{10}|sb_secret_[A-Za-z0-9]{10}|BEGIN (RSA |EC )?PRIVATE KEY'
if ($hits) { $hits | Select-Object -First 3 | Out-Host; throw 'step 1 failed: a key-shaped string is in history' }
npm ci; Check 1
npm test; Check 1
npx tsc --noEmit; Check 1

Step 2 'Close self sign-up BEFORE anything is public (Supabase dashboard)'
Write-Host 'Supabase > Authentication > Providers > Email: turn OFF "Enable sign ups" (keep "Confirm email" on).'
Write-Host 'Leave "Allow unverified email sign-ins" OFF. Do not enable Google yet.'
Pause-For 'Email sign-ups are off.'

Step 3 'Push main to GitHub (fast-forward on top of "Create test")'
git push origin main; Check 3

Step 4 'Cloudflare Pages (D-23), in the Cloudflare dashboard'
Write-Host 'Workers & Pages > Create > Pages > Connect to Git > pamilyaligason-collab/Bantay, branch main.'
Write-Host 'Build command: npm run build   Output directory: dist   (Node comes from .node-version)'
Write-Host 'Environment variables (Production): VITE_SUPABASE_URL = https://wuakimpssycbtnmoexuc.supabase.co'
Write-Host '  VITE_SUPABASE_PUBLISHABLE_KEY = (Supabase > Project Settings > API keys > publishable)'
Write-Host '  VITE_APP_VERSION = 1.0.0'
Pause-For 'Create the Pages project and let the first build finish.'
$Origin = (Read-Host 'Pages origin, no trailing slash (e.g. https://bantay.pages.dev)').Trim().TrimEnd('/').ToLower()
if ($Origin -notmatch '^https://[a-z0-9.-]+$') { throw 'step 4 failed: origin must look like https://name.pages.dev' }

Step 5 'Supabase CLI: sign in and link the project (asks for the database password)'
npx -y $Sb login; Check 5
npx -y $Sb link --project-ref $Ref; Check 5

Step 6 'Apply migrations 0001-0005 (dry run first), then turn on the sign-up gate'
npx -y $Sb db push --dry-run; Check 6
Pause-For 'Read the dry run: it must list exactly 0001_health, 0002_auth, 0003_sync, 0004_admin, 0005_news_assistant.'
npx -y $Sb db push; Check 6
Write-Host 'Supabase > Authentication > Auth Hooks > Before User Created: Postgres function public.hook_before_user_created, enable.'
Pause-For 'The hook is enabled (only invited Google accounts can now sign up).'

Step 7 'Generate secrets (never printed) and set Edge Function secrets'
$bytes = New-Object byte[] 36; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$Pepper = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
$vapid = (npx -y web-push@3.6.7 generate-vapid-keys --json) | ConvertFrom-Json; Check 7
$VapidPub = $vapid.publicKey
$Contact = (Read-Host 'Contact email for push (VAPID subject)').Trim()
if ($Contact -notmatch '^[^@\s]+@[^@\s]+$') { throw 'step 7 failed: contact must be an email' }
$envFile = Join-Path $env:TEMP ('bantay-secrets-' + [guid]::NewGuid() + '.env')
try {
  @("PIN_PEPPER=$Pepper", "ALLOWED_ORIGIN=$Origin", "VAPID_PUBLIC_KEY=$VapidPub", "VAPID_PRIVATE_KEY=$($vapid.privateKey)", "VAPID_SUBJECT=mailto:$Contact") |
    Set-Content -Path $envFile -Encoding ascii
  npx -y $Sb secrets set --env-file $envFile --project-ref $Ref; Check 7
} finally { Remove-Item $envFile -Force -ErrorAction SilentlyContinue; $vapid = $null }
Set-Clipboard -Value $Pepper
Pause-For 'PIN_PEPPER is on your clipboard. Paste it into your password manager now (losing it means every PIN member needs a reset).'
Set-Clipboard -Value ' '
try { [Windows.ApplicationModel.DataTransfer.Clipboard, Windows.ApplicationModel.DataTransfer, ContentType = WindowsRuntime]::ClearHistory() | Out-Null } catch {}
$Pepper = $null
Pause-For 'Press Win+V and confirm the clipboard history is empty (and cloud clipboard sync is off).'

Step 8 'Deploy Edge Functions (server-side bundling, no Docker needed)'
npx -y $Sb functions deploy pin-login --no-verify-jwt --use-api --project-ref $Ref; Check 8
npx -y $Sb functions deploy admin-members --no-verify-jwt --use-api --project-ref $Ref; Check 8
npx -y $Sb functions deploy broadcast --use-api --project-ref $Ref; Check 8

Step 9 'Google sign-in and Auth URLs (dashboards)'
Write-Host "Google Cloud: OAuth consent screen External; add your Google email under Test users (or Publish)."
Write-Host "  Web client, redirect URI https://$Ref.supabase.co/auth/v1/callback"
Write-Host 'Supabase > Authentication > Providers > Google: enable, paste client id and secret.'
Write-Host "URL Configuration: Site URL = $Origin ; Redirect URLs add $Origin/**"
Write-Host 'Sessions / JWT: access token expiry 900 seconds.'
Pause-For 'Google is on and the URLs are set.'

Step 10 'Pages build env: VAPID public key (public value, no rebuild yet)'
Write-Host "VITE_VAPID_PUBLIC_KEY = $VapidPub"
Pause-For 'Add VITE_VAPID_PUBLIC_KEY in Pages > Settings > Environment variables, then Retry deployment.'

Step 11 'Make yourself admin (D-17)'
$Me = (Read-Host 'Your Google email').Trim().ToLower()
if ($Me -notmatch '^[^@\s]+@[^@\s]+$') { throw 'step 11 failed: not an email' }
npx -y $Sb db query --linked "insert into public.invites (email) values ('$(Esc $Me)') on conflict do nothing;"; Check 11
Pause-For "Open $Origin, choose Continue with Google and sign in once."
$sql = 'do $$ begin insert into public.app_roles (user_id, role) select id, ''admin'' from auth.users where lower(email) = ''{0}'' on conflict (user_id) do update set role = ''admin'', disabled = false; if not found then raise exception ''no auth user for that email yet: sign in with Google first''; end if; end $$;' -f (Esc $Me)
npx -y $Sb db query --linked $sql; Check 11
Write-Host 'Reload the app: an Admin link appears in the top bar. Add family from there.'

Step 12 'n8n assistant + news (on the VPS, B-9: Bantay credentials only)'
Write-Host 'Import ops/n8n/assistant.json and ops/n8n/news-feed.json (both arrive inactive).'
Write-Host "Credentials: 'Bantay OpenRouter ZDR' (Header Auth: Authorization = Bearer <OpenRouter key>),"
Write-Host "  'Bantay Supabase publishable' (Header Auth: apikey = publishable key), 'Bantay Supabase (service role)' (news feed only)."
Write-Host "Assistant Webhook node: Allowed Origins = $Origin. News feed: swap to the HTTP upsert noted on its Supabase node."
Write-Host 'Both workflows: Settings > Save execution data = off (success and error). OpenRouter: paid key, hard monthly spend limit, ZDR-only on.'
Pause-For 'Activate both workflows and copy the assistant production webhook URL.'
Write-Host 'Pages env: add VITE_ASSISTANT_URL = <that URL>; optional VITE_KIWIX_URL, VITE_ASSISTANT_DAILY_CAP. Then Retry deployment once.'
Pause-For 'Pages redeployed.'

Write-Host "`nDONE. Smoke test: sign in with Google; create a PIN member in Admin and sign in as them; send a test safety broadcast; try an uninvited Google account (must be refused)." -ForegroundColor Green
