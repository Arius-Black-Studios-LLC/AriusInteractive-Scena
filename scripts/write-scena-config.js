/**
 * Netlify build step — writes docs/scena-config.js from environment variables.
 */
const fs = require("fs");
const path = require("path");

const supabaseUrl = process.env.SCENA_SUPABASE_URL;
const supabaseAnonKey = process.env.SCENA_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Skipping scena-config.js: set SCENA_SUPABASE_URL and SCENA_SUPABASE_ANON_KEY."
  );
  process.exit(0);
}

const redirect =
  process.env.SCENA_AUTH_REDIRECT_URL ||
  (process.env.URL
    ? process.env.URL.replace(/\/$/, "") + "/scena-design-preview.html"
    : null);

function esc(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

const lines = [
  "/** Generated at deploy time — do not edit on Netlify builds. */",
  "window.SCENA_CONFIG = {",
  '  supabaseUrl: "' + esc(supabaseUrl) + '",',
  '  supabaseAnonKey: "' + esc(supabaseAnonKey) + '",',
];

if (redirect) {
  lines.push('  authRedirectUrl: "' + esc(redirect) + '",');
}

lines.push("};", "");

fs.writeFileSync(
  path.join(__dirname, "..", "docs", "scena-config.js"),
  lines.join("\n"),
  "utf8"
);
console.log("Wrote docs/scena-config.js for production.");
