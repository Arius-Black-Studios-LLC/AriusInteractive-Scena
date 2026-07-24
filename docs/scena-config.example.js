/**
 * Copy to scena-config.js and fill in your Supabase project values.
 * (Filename kept for compatibility — config is exposed as window.ARLECO_CONFIG.)
 * Dashboard: https://supabase.com/dashboard → Project Settings → API
 *
 * 1. Create a project at https://supabase.com/dashboard
 * 2. Copy this file to scena-config.js and paste URL + anon key below
 * 3. Run docs/serve.ps1 (or Live Preview) — do NOT open via file://
 * 4. Supabase → Authentication → URL configuration:
 *      Site URL:      http://127.0.0.1:5500/
 *      Redirect URLs: http://127.0.0.1:5500/
 *                     http://127.0.0.1:5500/studio
 *                     http://127.0.0.1:5500/account
 *      (Production: https://arleco.app/ — see docs/DOMAIN.md)
 * 5. Run docs/supabase-setup.sql in SQL Editor (creates profiles table — run FIRST)
 * 6. Optional: supabase-badges-setup.sql, supabase-cloud-setup.sql
 *    (Only run supabase-profile-fields.sql if you used an older setup.sql without username/pronouns/avatar)
 */
window.ARLECO_CONFIG = {
  supabaseUrl: "https://YOUR_PROJECT.supabase.co",
  supabaseAnonKey: "YOUR_ANON_PUBLIC_KEY",
  // authRedirectUrl: "http://127.0.0.1:5500/",
};
window.SCENA_CONFIG = window.ARLECO_CONFIG;
