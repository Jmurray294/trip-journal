#!/usr/bin/env bash
# One-time sign-in setup for the Trip Journal Supabase project:
#   - the app's address (Site URL + allowed redirects)
#   - sign-in emails that contain a 6-digit code (needed for home-screen apps on iPhone)
# Usage: bash supabase/configure-auth.sh <personal-access-token>
set -euo pipefail
TOKEN="${1:?pass your sbp_ access token}"
REF="hevucbiddgcvbxynstjn"
API="https://api.supabase.com/v1/projects/$REF/config/auth"

BODY='<h2>Your Trip Journal code</h2><p>Enter this code in the app:</p><p><strong style=\"font-size:28px;letter-spacing:6px\">{{ .Token }}</strong></p><p style=\"color:#7A7060\">It expires in an hour. If you did not ask for it, you can ignore this email.</p>'

code=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$API" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{
  \"site_url\": \"https://jcmurraytrips.com/\",
  \"uri_allow_list\": \"https://jcmurraytrips.com/**,https://jmurray294.github.io/trip-journal/**,http://localhost:5173/**,http://localhost:4173/**\",
  \"mailer_subjects_confirmation\": \"Your Trip Journal code\",
  \"mailer_templates_confirmation_content\": \"$BODY\",
  \"mailer_subjects_magic_link\": \"Your Trip Journal code\",
  \"mailer_templates_magic_link_content\": \"$BODY\"
}")
echo "Update: HTTP $code"

curl -s "$API" -H "Authorization: Bearer $TOKEN" | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  const j=JSON.parse(s);
  console.log('Site URL:      ', j.site_url);
  console.log('Redirect URLs: ', j.uri_allow_list);
  console.log('Code in emails:', j.mailer_templates_magic_link_content.includes('{{ .Token }}') && j.mailer_templates_confirmation_content.includes('{{ .Token }}') ? 'yes' : 'NO');
});"
