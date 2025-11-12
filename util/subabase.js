import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

export const createClient = context => {
  return createServerClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return parseCookieHeader(context.req.headers.cookie ?? '')
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          context.res.appendHeader('Set-Cookie', serializeCookieHeader(name, value, options))
        )
      },
    },
  })
}

// export const admin = createSupabaseAdminClient(
//   process.env.SUPABASE_URL,
//   process.env.SUPABASE_SERVICE_ROLE_KEY,
//   { auth: { autoRefreshToken: false, persistSession: false } }
// )
