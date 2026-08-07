# Paste these into Supabase Dashboard → Authentication → Emails (Arleco project).
#
# SMTP:
#   Sender email = hello@ariusinteractive.com
#   Sender name  = Arleco
#
# Subjects:
#   recovery      → Reset your Arleco password
#   magic_link    → Your Arleco sign-in link
#   confirmation  → Confirm your Arleco email
#   invite        → You're invited to Arleco
#   email_change  → Confirm your new Arleco email
#
# Keep {{ .ConfirmationURL }} unchanged — Supabase replaces it with the real link.
# Recipients see “click here”, not the long URL.
#
# Logo (live site):
#   https://arleco.app/arleco-icon.png
#
# Brand colors (match arleco.app / docs/arleco-theme.css):
#   Red     #7c1128
#   Cream   #f7f6f3
#   Gold    #f0d78c (header label accent)
