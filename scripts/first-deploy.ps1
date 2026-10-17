# Family Bantay - first deploy (Lloyd runs this once, interactively). PowerShell 5.1.
# Stops at the first failure. Secrets are generated or typed here and never printed; nothing secret is written to the repo.
# Decisions: D-15 history already rewritten, D-16..D-23. Full manual notes: README.md, docs/AUTH.md, docs/ASSISTANT.md.
$ErrorActionPreference = 'Stop'
$Ref = 'wuakimpssycbtnmoexuc'
$Sb = 'supabase@2.121.0'
Set-Location (Split-Path $PSScriptRoot -Parent)
function Step($n, $t) { Write-Host "`n== Step $n. $t" -ForegroundColor Cyan }
function Check($n) { if ($LASTEXITCODE -ne 0) { throw "step $n failed (exit $LASTEXITCODE)" } }
function Pause-For($msg) { Read-Host "$msg  (press Enter when done)" | Out-Null }

Step 1 'Checks before push'
git diff --quiet; Check 1
if (git log --oneline main -- BANTAY_CLAUDE_CODE_PROMPT_v001.md) { throw 'step 1 failed: history still holds the build prompt (D-15)' }
$hits = git log -p main | Select-String -Pattern 'sk-or-v1-[A-Za-z0-9]{10}|sb_secret_[A-Za-z0-9]{10}|BEGIN (RSA |EC )?PRIVATE KEY'
if ($hits) { throw 'step 1 failed: a key-shaped string is in history' }
npm ci; Check 1
npm test; Check 1

Step 2 'Push main to GitHub (fast-forward on top of "Create test")'
git push origin main; Check 2

Step 3 'Cloudflare Pages (D-23), in the Cloudflare dashboard'
Write-Host 'Workers & Pages > Create > Pages > Connect to Git > pamilyaligason-collab/Bantay, branch main.'
Write-Host 'Build command: npm run build   Output directory: dist   (Node comes from .node-version)'
Write-Host 'Environment variables (Production): VITE_SUPABASE_URL = https://wuakimpssycbtnmoexuc.supabase.co'
Write-Host '  VITE_SUPABASE_PUBLISHABLE_KEY = (Supabase > Project Settings > API keys > publishable)'
Write-Host '  VITE_APP_VERSION = 1.0.0   (VITE_VAPID_PUBLIC_KEY and VITE_ASSISTANT_URL come later in this script)'
Pause-For 'Create the Pages project and let the first build finish.'
$Origin = (Read-Host 'Pages origin, no trailing slash (e.g. https://bantay.pages.dev)').TrimEnd('/')
if ($Origin -notmatch '^https://[a-z0-9.-]+$') { throw 'step 3 failed: origin must look like https://name.pages.dev' }

Step 4 'Supabase CLI: sign in and link the project (asks for the database password)'
npx -y $Sb login; Check 4
npx -y $Sb link --project-ref $Ref; Check 4

Step 5 'Apply migrations 0001-0005 (dry run first)'
npx -y $Sb db push --dry-run; Check 5
Pause-For 'Read the dry run: it must list exactly 0001_health, 0002_auth, 0003_sync, 0004_admin, 0005_news_assistant.'
npx -y $Sb db push; Check 5

Step 6 'Generate secrets (never printed) and set Edge Function secrets'
$bytes = New-Object byte[] 36; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$Pepper = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
$vapid = (npx -y web-push@3.6.7 generate-vapid-keys --json) | ConvertFrom-Json; Check 6
$Contact = Read-Host 'Contact email for push (VAPID subject)'
$envFile = Join-Path $env:TEMP ('bantay-secrets-' + [guid]::NewGuid() + '.env')
try {
  @("PIN_PEPPER=$Pepper", "ALLOWED_ORIGIN=$Origin", "VAPID_PUBLIC_KEY=$($vapid.publicKey)", "VAPID_PRIVATE_KEY=$($vapid.privateKey)", "VAPID_SUBJECT=mailto:$Contact") |
    Set-Content -Path $envFile -Encoding ascii
  npx -y $Sb secrets set --env-file $envFile --project-ref $Ref; Check 6
} finally { Remove-Item $envFile -Force -ErrorAction SilentlyContinue }
Set-Clipboard -Value $Pepper
Pause-For 'PIN_PEPPER is on your clipboard. Save it in your password manager now (losing it means every PIN member needs a reset).'
Set-Clipboard -Value ' '
$Pepper = $null

Step 7 'Deploy Edge Functions (server-side bundling, no Docker needed)'
npx -y $Sb functions deploy pin-login --no-verify-jwt --use-api --project-ref $Ref; Check 7
npx -y $Sb functions deploy admin-members --no-verify-jwt --use-api --project-ref $Ref; Check 7
npx -y $Sb functions deploy broadcast --use-api --project-ref $Ref; Check 7

Step 8 'Supabase Auth settings (dashboard)'
Write-Host "Google Cloud: OAuth consent screen + Web client, redirect URI https://$Ref.supabase.co/auth/v1/callback"
Write-Host 'Supabase > Authentication > Providers > Google: enable, paste client id and secret.'
Write-Host 'Providers > Email: turn OFF "Enable sign ups" (keep Confirm email on). Leave "Allow unverified email sign-ins" off.'
Write-Host "URL Configuration: Site URL = $Origin ; Redirect URLs add $Origin/**"
Write-Host 'Auth Hooks > Before User Created: Postgres function public.hook_before_user_created, enable.'
Write-Host 'Sessions / JWT: access token expiry 900 seconds.'
Pause-For 'Finish the Auth settings.'

Step 9 'Pages build env: VAPID public key (public value)'
Write-Host "VITE_VAPID_PUBLIC_KEY = $($vapid.publicKey)"
Pause-For 'Add VITE_VAPID_PUBLIC_KEY in Pages > Settings > Environment variables, then Retry deployment.'

Step 10 'Make yourself admin (D-17)'
$Me = (Read-Host 'Your Google email').Trim().ToLower()
if ($Me -notmatch '^[^@\s]+@[^@\s]+$') { throw 'step 10 failed: not an email' }
$sql1 = "insert into public.invites (email) values ('$($Me.Replace("'","''"))') on conflict do nothing;"
npx -y $Sb db query --linked $sql1; Check 10
Pause-For "Open $Origin, choose Continue with Google and sign in once."
$sql2 = "update public.app_roles set role='admin' where user_id=(select id from auth.users where lower(email)='$($Me.Replace("'","''"))');"
npx -y $Sb db query --linked $sql2; Check 10
Write-Host 'Reload the app: an Admin link appears in the top bar. Add family from there.'

Step 11 'n8n assistant + news (on the VPS, B-9: Bantay credentials only)'
Write-Host 'Import ops/n8n/assistant.json and ops/n8n/news-feed.json (both arrive inactive).'
Write-Host "Credentials: 'Bantay OpenRouter ZDR' (Header Auth: Authorization = Bearer <OpenRouter key>),"
Write-Host "  'Bantay Supabase publishable' (Header Auth: apikey = publishable key), 'Bantay Supabase (service role)' (news feed only)."
Write-Host "Assistant Webhook node: Allowed Origins = $Origin. News feed: swap to the HTTP upsert noted on its Supabase node."
Write-Host 'OpenRouter: paid key, hard monthly spend limit, account ZDR-only on.'
Pause-For 'Activate both workflows, then copy the assistant production webhook URL.'
Write-Host 'Add VITE_ASSISTANT_URL = <that URL> in Pages env and Retry deployment.'

Write-Host "`nDONE. Smoke test: sign in with Google; create a PIN member in Admin and sign in as them; send a test safety broadcast; try an uninvited Google account (must be refused)." -ForegroundColor Green
