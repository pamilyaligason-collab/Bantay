import { createClient } from '@supabase/supabase-js'

// One Supabase client for the app (contract D-16..D-19). null when env is not set (tests, unconfigured builds).
export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
export const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined
export const supabase =
  supabaseUrl && supabasePublishableKey
    ? createClient(supabaseUrl, supabasePublishableKey, { auth: { persistSession: true, autoRefreshToken: true, flowType: 'pkce' } })
    : null
