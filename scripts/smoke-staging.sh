#!/usr/bin/env bash
#
# smoke-staging.sh — deployed-API smoke test for the MARS Sprint 1 contract.
#
# Covers (SPRINT1_PLAN.md §15.6):
#   1. GET  /health                        -> 200 with status/db body
#   2. GET  /auth/me (no cookie)           -> 401          (US01 AC4, API side)
#   3. POST /auth/login + X-MARS-CSRF: 1   -> 200, httpOnly `mars_at` cookie,
#                                             no token in body (US01 AC1)
#   4. GET  /auth/me (cookie jar)          -> 200          (session restore)
#   5. POST /auth/login without CSRF header -> 403         (CSRF enforcement)
#   6. POST /auth/logout + CSRF header     -> 204, cleared cookie (US01 AC3)
#   7. GET  /auth/me (pre-logout cookie)   -> 401          (session revoked)
#
# Deliberately NOT covered here (manual; see docs/qa/strategy.md §12):
#   email delivery (Mailtrap/Resend), the reset happy path (needs an emailed
#   token), and cross-site CORS/cookie behaviour in a real browser.
#
# Usage:
#   BASE_URL=https://<api-host> \
#   SMOKE_EMAIL=pm@rafconsult.test \
#   SMOKE_PASSWORD='<seeded password from your env/vault>' \
#   bash scripts/smoke-staging.sh
#
# The password is read from the environment only; this file stores no secrets.
# The script never prints the password, tokens, cookies, or request bodies.
#
# Exit codes: 0 = all checks passed, 1 = at least one check failed,
#             2 = missing input or tool.

set -euo pipefail

BASE_URL="${BASE_URL:-}"
SMOKE_EMAIL="${SMOKE_EMAIL:-}"
SMOKE_PASSWORD="${SMOKE_PASSWORD:-}"
TIMEOUT_SECONDS="${SMOKE_TIMEOUT:-15}"
CSRF_HEADER="X-MARS-CSRF: 1"

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 2
}

[ -n "$BASE_URL" ] || die "BASE_URL is required (e.g. BASE_URL=https://api.example.up.railway.app)"
[ -n "$SMOKE_EMAIL" ] || die "SMOKE_EMAIL is required (use a seeded staging account)"
[ -n "$SMOKE_PASSWORD" ] || die "SMOKE_PASSWORD is required; pass it through the environment, never an argument"
command -v curl >/dev/null 2>&1 || die "curl is required"

BASE_URL="${BASE_URL%/}"
case "$BASE_URL" in
  https://*) ;;
  http://*) printf 'WARN: BASE_URL is plain HTTP (%s); staging must be HTTPS.\n' "$BASE_URL" >&2 ;;
  *) die "BASE_URL must start with http:// or https:// (got: $BASE_URL)" ;;
esac

case "$TIMEOUT_SECONDS" in
  '' | *[!0-9]*) die "SMOKE_TIMEOUT must be an integer number of seconds" ;;
esac
[ "$TIMEOUT_SECONDS" -ge 1 ] || die "SMOKE_TIMEOUT must be at least 1 second"

WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/mars-smoke.XXXXXX")"
cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

COOKIE_JAR="$WORK_DIR/cookies.jar"
OLD_COOKIE_JAR="$WORK_DIR/cookies-before-logout.jar"
HEADERS="$WORK_DIR/headers.txt"
BODY="$WORK_DIR/body.json"
LOGIN_PAYLOAD="$WORK_DIR/login-payload.json"

TOTAL=0
FAILED=0
FAILED_NAMES=""

pass() {
  TOTAL=$((TOTAL + 1))
  printf 'PASS  %s\n' "$1"
}

fail() {
  TOTAL=$((TOTAL + 1))
  FAILED=$((FAILED + 1))
  FAILED_NAMES="${FAILED_NAMES}${FAILED_NAMES:+$'\n'}  - $1"
  printf 'FAIL  %s\n' "$1"
  if [ "$#" -gt 1 ]; then
    printf '      %s\n' "$2"
  fi
}

# http_request <METHOD> <PATH> [curl args...]
# Writes response headers to $HEADERS and the body to $BODY.
# Prints the HTTP status code, or 000 when the transport failed.
http_request() {
  local method="$1"
  local path="$2"
  local status
  shift 2

  # Truncate first so a failed request cannot leave stale content behind and
  # make a negative assertion pass against a previous response.
  : >"$HEADERS"
  : >"$BODY"

  status="$(curl --silent --show-error \
    --connect-timeout "$TIMEOUT_SECONDS" \
    --max-time "$TIMEOUT_SECONDS" \
    --request "$method" \
    --dump-header "$HEADERS" \
    --output "$BODY" \
    --write-out '%{http_code}' \
    "$@" \
    "$BASE_URL$path")" || status="000"

  printf '%s' "$status"
}

expect_status() { # <label> <expected> <actual>
  if [ "$3" = "$2" ]; then
    pass "$1 (HTTP $3)"
  else
    fail "$1" "expected HTTP $2, got $3"
  fi
}

expect_body_has() { # <label> <literal>
  if [ ! -s "$BODY" ]; then
    fail "$1" "no response body to inspect (request did not complete)"
  elif grep -qF -- "$2" "$BODY" 2>/dev/null; then
    pass "$1"
  else
    fail "$1" "response body is missing: $2"
  fi
}

expect_body_lacks() { # <label> <literal>
  if [ ! -s "$BODY" ]; then
    fail "$1" "no response body to inspect (request did not complete)"
  elif grep -qF -- "$2" "$BODY" 2>/dev/null; then
    fail "$1" "response body unexpectedly contains: $2"
  else
    pass "$1"
  fi
}

expect_header_has() { # <label> <literal, case-insensitive>
  if [ ! -s "$HEADERS" ]; then
    fail "$1" "no response headers to inspect (request did not complete)"
  elif grep -qiF -- "$2" "$HEADERS" 2>/dev/null; then
    pass "$1"
  else
    fail "$1" "response headers are missing: $2"
  fi
}

expect_header_matches() { # <label> <extended regex, case-insensitive>
  if [ ! -s "$HEADERS" ]; then
    fail "$1" "no response headers to inspect (request did not complete)"
  elif grep -qiE -- "$2" "$HEADERS" 2>/dev/null; then
    pass "$1"
  else
    fail "$1" "response headers do not match: $2"
  fi
}

json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/\t/\\t/g' -e 's/\r/\\r/g'
}

printf 'MARS staging smoke\n'
printf '  target:  %s\n' "$BASE_URL"
printf '  account: %s\n' "$SMOKE_EMAIL"
printf '  timeout: %ss per request\n' "$TIMEOUT_SECONDS"

# The password is written to a 0600 file so it does not appear in process args.
LOGIN_PAYLOAD_EMAIL="$(json_escape "$SMOKE_EMAIL")"
LOGIN_PAYLOAD_PASSWORD="$(json_escape "$SMOKE_PASSWORD")"
printf '{"email":"%s","password":"%s"}' "$LOGIN_PAYLOAD_EMAIL" "$LOGIN_PAYLOAD_PASSWORD" >"$LOGIN_PAYLOAD"
chmod 600 "$LOGIN_PAYLOAD"

printf '\n1) health\n'
STATUS="$(http_request GET /health)"
expect_status "health endpoint responds" 200 "$STATUS"
if [ "$STATUS" = "000" ]; then
  printf 'WARN: %s is unreachable (curl transport failure); the remaining checks will fail.\n' "$BASE_URL" >&2
  printf '      Check the URL, DNS, TLS certificate, and Railway cold start, then rerun.\n' >&2
fi
expect_body_has "health body includes status" '"status"'
expect_body_has "health body includes db" '"db"'

printf '\n2) unauthenticated /auth/me\n'
STATUS="$(http_request GET /auth/me)"
expect_status "unauthenticated /auth/me is rejected" 401 "$STATUS"

printf '\n3) login with X-MARS-CSRF\n'
STATUS="$(http_request POST /auth/login \
  --header 'Content-Type: application/json' \
  --header "$CSRF_HEADER" \
  --cookie-jar "$COOKIE_JAR" \
  --data @"$LOGIN_PAYLOAD")"
expect_status "login with valid credentials succeeds" 200 "$STATUS"
expect_header_has "login sets the mars_at cookie" 'mars_at'
expect_header_has "the auth cookie is HttpOnly" 'HttpOnly'
expect_header_has "the auth cookie path is /" 'Path=/'
expect_header_matches "the auth cookie declares SameSite" 'SameSite='
expect_header_matches "the auth cookie declares Max-Age" 'Max-Age='
expect_body_has "login body includes the user" '"user"'
expect_body_has "login body includes redirectTo" '"redirectTo"'
expect_body_lacks "login body has no access token" 'accessToken'
expect_body_lacks "login body has no refresh token" 'refreshToken'
if grep -qF 'mars_at' "$COOKIE_JAR" 2>/dev/null; then
  pass "cookie jar contains mars_at"
else
  fail "cookie jar contains mars_at" "login did not persist the auth cookie"
fi

printf '\n4) authenticated /auth/me\n'
STATUS="$(http_request GET /auth/me --cookie "$COOKIE_JAR")"
expect_status "cookie-authenticated /auth/me succeeds" 200 "$STATUS"
expect_body_has "/auth/me returns the user" '"user"'
expect_body_has "/auth/me returns the signed-in email" "$SMOKE_EMAIL"
expect_body_lacks "/auth/me does not return a token" 'accessToken'

printf '\n5) CSRF rejection\n'
STATUS="$(http_request POST /auth/login \
  --header 'Content-Type: application/json' \
  --data @"$LOGIN_PAYLOAD")"
expect_status "login without X-MARS-CSRF is rejected" 403 "$STATUS"
expect_body_has "CSRF rejection names the header" 'CSRF'

printf '\n6) logout\n'
cp "$COOKIE_JAR" "$OLD_COOKIE_JAR"
STATUS="$(http_request POST /auth/logout \
  --header "$CSRF_HEADER" \
  --cookie "$COOKIE_JAR" \
  --cookie-jar "$COOKIE_JAR")"
expect_status "logout succeeds" 204 "$STATUS"
expect_header_matches "logout clears the mars_at cookie" 'mars_at=.*(Max-Age=0|Max-Age=-1|1970)'

printf '\n7) revoked session\n'
STATUS="$(http_request GET /auth/me --cookie "$OLD_COOKIE_JAR")"
expect_status "pre-logout cookie is rejected after logout" 401 "$STATUS"

printf '\n----------------------------------------\n'
if [ "$FAILED" -eq 0 ]; then
  printf 'RESULT: PASS — %d/%d checks passed\n' "$TOTAL" "$TOTAL"
  exit 0
fi

printf 'RESULT: FAIL — %d of %d checks failed\n' "$FAILED" "$TOTAL"
printf 'Failed checks:\n%s\n' "$FAILED_NAMES"
exit 1
