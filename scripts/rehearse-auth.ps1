$ErrorActionPreference = 'Stop'
# Runs supabase/tests/auth_rehearsal.sql on a throwaway Postgres in WSL Ubuntu (never the live project).
$repo = (Resolve-Path "$PSScriptRoot\..").Path
$wslPath = '/mnt/' + $repo.Substring(0, 1).ToLower() + ($repo.Substring(2) -replace '\\', '/')
$cmd = "service postgresql start; su postgres -c 'dropdb --if-exists bantay_a1; createdb bantay_a1; psql -X -v ON_ERROR_STOP=1 -d bantay_a1 -f $wslPath/supabase/tests/auth_rehearsal.sql'"
$ErrorActionPreference = 'Continue'
wsl -d Ubuntu -- bash -c $cmd
if ($LASTEXITCODE -ne 0) { throw 'rehearsal failed' }
