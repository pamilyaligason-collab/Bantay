import { createClient } from '@supabase/supabase-js'

// One Supabase client for the app (contract D-16..D-19). null when env is not set (tests, unconfigured builds).
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined
export const supabase = url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } }) : null
