/**
 * Netlify build step — writes docs/scena-config.js from environment variables.
 * Exposes window.ARLECO_CONFIG (and SCENA_CONFIG alias for compatibility).
 */
const fs = require("fs");
const path = require("path");

const supabaseUrl = process.env.ARLECO_SUPABASE_URL || process.env.SCENA_SUPABASE_URL;
const supabaseAnonKey = process.env.ARLECO_SUPABASE_ANON_KEY || process.env.SCENA_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Skipping scena-config.js: set ARLECO_SUPABASE_URL and ARLECO_SUPABASE_ANON_KEY (or SCENA_*)."
  );
  process.exit(0);
}

const deployUrl =
  process.env.DEPLOY_PRIME_URL ||
  process.env.URL ||
  process.env.DEPLOY_URL;

const redirect =
  process.env.ARLECO_AUTH_REDIRECT_URL ||
  process.env.SCENA_AUTH_REDIRECT_URL ||
  (deployUrl ? deployUrl.replace(/\/$/, "") + "/" : null);

function esc(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

const lines = [
  "/** Generated at deploy time — do not edit on Netlify builds. */",
  "window.ARLECO_CONFIG = {",
  '  supabaseUrl: "' + esc(supabaseUrl) + '",',
  '  supabaseAnonKey: "' + esc(supabaseAnonKey) + '",',
];

if (redirect) {
  lines.push('  authRedirectUrl: "' + esc(redirect) + '",');
}

lines.push("};", "window.SCENA_CONFIG = window.ARLECO_CONFIG;", "");

fs.writeFileSync(
  path.join(__dirname, "..", "docs", "scena-config.js"),
  lines.join("\n"),
  "utf8"
);
console.log("Wrote docs/scena-config.js for production.");
