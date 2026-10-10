# UAT deployment on `training.holigayeventsyyc.ca` — Implementation Plan (BL-14)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task in **one** session (the tasks are dashboard clicks and one API call, not parallelisable code). Steps use checkbox (`- [ ]`) syntax for tracking. Tick them in this file as you go.

**Goal:** Serve the `dev` branch (the organizers' training deployment) at `https://training.holigayeventsyyc.ca` instead of only `uat-holigay-yyc.vercel.app`, with the dev Supabase project's emailed links pointing at the new host.

**Architecture:** A Vercel *branch domain* on the existing `holigay-yyc` project (environment Preview, branch `dev`), one CNAME at GoDaddy, and two fields on the dev Supabase project's auth config. No code changes; `VERCEL_ENV` stays `preview`. Design: `docs/superpowers/specs/2026-10-09-uat-custom-domain-design.md`.

**Tech Stack:** Chrome extension (`mcp__claude-in-chrome__*`) for the Vercel and GoDaddy dashboards; `curl` + `jq` against the Supabase Management API with the CLI login token read from the GNOME keyring; `dig`; a docs-only PR to `dev`.

## Global Constraints

- Hostname is exactly `training.holigayeventsyyc.ca`.
- Vercel project `holigay-yyc`, team `owen-roses-projects`. Domain goes on **Preview / branch `dev`**, never Production.
- Supabase **dev** project ref `kcokcufmzyckbodelqpb`. Prod ref `hgmfjvjlxrhdojwlkgap` is **never** passed to any command in this plan.
- GoDaddy zone `holigayeventsyyc.ca` (Owen's delegate access). **Add** one record; never edit or delete `vendors`, `send`, `rsend`, `resend._domainkey`, or the apex.
- The Management API token lives in a shell variable; never echo it; redact any `sbp_…` from output. Reading it needs a **default-mode** session (auto mode blocks the keyring read).
- Chrome: call `tabs_context_mcp` first, open a **new** tab per site, never reuse tab ids from earlier sessions. Owen is already signed in to GoDaddy, Supabase and Vercel in this Chrome profile. Stop and ask after 2–3 failed browser actions.
- `uat-holigay-yyc.vercel.app` and `holigay-yyc-git-dev-owen-roses-projects.vercel.app` keep working and stay in the Supabase allow-list.
- `SCRATCH` = the session's scratchpad directory (the path in the system prompt's Environment block). Set `SCRATCH=<that path>` at the top of every Bash call that uses it; shell variables do not persist between calls.
- Commits: no Co-Authored-By trailers, no "Generated with Claude Code" lines (project rule). Branch `bl-14-uat-custom-domain` (already exists, carries the design doc and this plan). Gate before the PR: `npm run lint && npm test && npm run build`.

---

### Task 1: Baseline and pre-flight

**Files:**
- Create: `$SCRATCH/bl14-baseline.txt` (scratch only; not committed)

**Interfaces:**
- Produces: the baseline DNS answers that Task 6 compares against.

- [x] **Step 1: Confirm branch and clean tree**

Run: `git -C /home/wrenn/Github/Holigay-YYC status --short --branch`
Expected: `## bl-14-uat-custom-domain...origin/bl-14-uat-custom-domain` and no changed files.

- [x] **Step 2: Record the DNS baseline**

```bash
cd /home/wrenn/Github/Holigay-YYC
for n in vendors send rsend resend._domainkey training; do
  printf '%-18s CNAME %s\n' "$n" "$(dig +short "$n.holigayeventsyyc.ca" CNAME | tr '\n' ' ')"
done | tee "$SCRATCH/bl14-baseline.txt"
dig +short resend._domainkey.holigayeventsyyc.ca TXT | tee -a "$SCRATCH/bl14-baseline.txt"
```
Expected: `vendors` → a `*.vercel-dns-017.com.` target; `send`/`rsend` → Resend targets; `resend._domainkey` → a TXT (`p=…`); **`training` → empty**. If `training` already has a record, stop and ask Owen.

- [x] **Step 3: Confirm the two preview hosts are reachable logged-out**

Run: `for h in uat-holigay-yyc.vercel.app holigay-yyc-git-dev-owen-roses-projects.vercel.app; do curl -s -o /dev/null -w "$h %{http_code}\n" "https://$h/"; done`
Expected: both `200` (Deployment Protection is off; verified 2026-10-09). A `302` to `vercel.com/sso-api` means protection was turned back on — stop and ask.

- [x] **Step 4: Connect Chrome**

Call `mcp__claude-in-chrome__tabs_context_mcp`. Expected: a tab list. If the extension does not answer, stop and ask Owen to open Chrome with the extension connected.

---

### Task 2: Add the domain to the Vercel project (Preview, branch `dev`)

**Files:** none (dashboard only)

**Interfaces:**
- Produces: `VERCEL_CNAME_TARGET` — the exact CNAME value Vercel asks for (looks like `<hex>.vercel-dns-017.com`). Task 3 uses it verbatim.

- [x] **Step 1: Open the Domains settings in a new tab**

`tabs_create_mcp`, then `navigate` to `https://vercel.com/owen-roses-projects/holigay-yyc/settings/domains`. Take a screenshot. Expected: the Domains page listing `vendors.holigayeventsyyc.ca` (Production) and the `*.vercel.app` hosts. If Vercel shows a login page, ask Owen to sign in, then reload.

- [x] **Step 2: Add the domain**

Click **Add** (or **Add Domain**). In the dialog: domain `training.holigayeventsyyc.ca`; environment **Preview**; git branch **`dev`** (the dialog may call it "Connect to an environment" → Preview → branch, or show a branch field after the domain is added — in that case add the domain, then open its row's **Edit** and set *Git Branch* to `dev`). Confirm. Screenshot the result.

Expected: a new row `training.holigayeventsyyc.ca` whose badge says **Preview** and **`dev`**, with a status of *Invalid Configuration* and a box showing the required record: `Type CNAME · Name training · Value <hex>.vercel-dns-017.com`.

- [x] **Step 3: Capture the CNAME target**

Read the Value from the page (use `read_page` / `get_page_text`, not a guess). Write it down in the session as `VERCEL_CNAME_TARGET`. Expected shape: ends in `.vercel-dns-017.com` (or `cname.vercel-dns.com` on older projects). Compare with `vendors`'s baseline target from Task 1 — same suffix family is expected; a different form is fine as long as it came from the page.

- [x] **Step 4: Check the row is on Preview, not Production**

Screenshot the row. Expected: the `vendors.holigayeventsyyc.ca` row still says Production and the new row says Preview / `dev`. If the new row says Production, open its Edit and change it before going on.

---

### Task 3: Add the CNAME at GoDaddy

**Files:** none (dashboard only)

**Interfaces:**
- Consumes: `VERCEL_CNAME_TARGET` from Task 2.

- [x] **Step 1: Open the DNS records for the zone in a new tab**

`tabs_create_mcp`, then `navigate` to `https://dcc.godaddy.com/control/holigayeventsyyc.ca/dns`. Screenshot. Expected: the DNS Records table showing at least the rows `vendors` (CNAME), `send`, `rsend`, `resend._domainkey` (TXT). If GoDaddy opens on Owen's own domain list instead, ask him to switch to the **delegate** account for `holigayeventsyyc.ca` in the account menu, then reload.

- [x] **Step 2: Add the record**

Click **Add New Record** (or **Add**). Type **CNAME**; Name `training`; Value `VERCEL_CNAME_TARGET` exactly as captured (no trailing dot needed; GoDaddy strips it); TTL default (1 hour) or 600 seconds if offered. Save. Screenshot.

Expected: a new row `training · CNAME · <target>`. The other rows are unchanged (count them against Task 1's baseline; four named records plus whatever the apex has).

- [x] **Step 3: Confirm propagation from the shell**

Run: `for i in 1 2 3 4 5 6; do r=$(dig +short training.holigayeventsyyc.ca CNAME @1.1.1.1); [ -n "$r" ] && { echo "$r"; break; }; sleep 20; done`
Expected: prints the target within about two minutes. If empty after six tries, also query `@8.8.8.8` and GoDaddy's own nameservers (`dig NS holigayeventsyyc.ca +short`); wait up to ten minutes before treating it as a problem.

---

### Task 4: Let Vercel verify and issue the certificate

**Files:** none

- [x] **Step 1: Refresh the Vercel row**

Back on the Vercel Domains tab: click **Refresh** on the `training.holigayeventsyyc.ca` row (or reload the page). Screenshot. Expected: status becomes **Valid Configuration**; a certificate spinner may show for a minute.

- [x] **Step 2: Confirm HTTPS from the shell**

Run: `curl -sS -o /dev/null -w "%{http_code} %{ssl_verify_result}\n" https://training.holigayeventsyyc.ca/`
Expected: `200 0`. A `000` with an SSL error means the certificate is still being issued — wait a minute and retry (up to five minutes). A `404` with `DEPLOYMENT_NOT_FOUND` means the row is not attached to branch `dev` — go back to Task 2 Step 4.

- [x] **Step 3: Confirm the invite-only posture carried over**

Run: `for p in / /apply /login /signup; do curl -s -o /dev/null -w "$p %{http_code}\n" "https://training.holigayeventsyyc.ca$p"; done`
Expected: `/ 200`, `/apply 200`, `/login 200`, **`/signup 404`** (the middleware rewrite under `NEXT_PUBLIC_INVITE_ONLY=true`). A `200` on `/signup` means this is not a Preview deployment — stop and re-check Task 2.

---

### Task 5: Point the dev Supabase project's auth URLs at the new host

**Files:**
- Create (scratch, not committed): `$SCRATCH/bl14-auth-before.json`, `$SCRATCH/bl14-auth-after.json`

**Interfaces:**
- Consumes: nothing from Chrome; this is terminal-only and needs a **default-mode** session.

- [x] **Step 1: Read the CLI token from the keyring**

Runbook source: `docs/runbooks/reset-hosted-project.md` ("Management API" section). Repeated here so this task stands alone:

```bash
TOKEN=$(/usr/bin/python3 - <<'PY'
import gi
gi.require_version("Gio", "2.0")
from gi.repository import Gio, GLib

bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
def call(path, iface, method, params, sig):
    return bus.call_sync("org.freedesktop.secrets", path, iface, method,
                         GLib.Variant(sig, params), None, Gio.DBusCallFlags.NONE, -1, None)

_, session = call("/org/freedesktop/secrets", "org.freedesktop.Secret.Service",
                  "OpenSession", ("plain", GLib.Variant("s", "")), "(sv)").unpack()
unlocked, locked = call("/org/freedesktop/secrets", "org.freedesktop.Secret.Service",
                        "SearchItems", ({"service": "Supabase CLI"},), "(a{ss})").unpack()
items = unlocked or locked
if not items:
    raise SystemExit("no 'Supabase CLI' item in the keyring — run `npx supabase login` first")
secret = call(items[0], "org.freedesktop.Secret.Item", "GetSecret", (session,), "(o)").unpack()[0]
print(bytes(secret[2]).decode())
PY
)
test -n "$TOKEN" && echo "token ok (${#TOKEN} chars)" || { echo "no token"; exit 1; }
REF=kcokcufmzyckbodelqpb   # DEV. Never hgmfjvjlxrhdojwlkgap here.
```
Expected: `token ok (NN chars)`. Never print `$TOKEN`. If the command is denied, the session is in auto mode — ask Owen to switch to default mode and run the whole task in one Bash call (shell variables do not persist between calls).

- [x] **Step 2: Read the current values (same Bash call as Step 1)**

```bash
curl -sS "https://api.supabase.com/v1/projects/$REF/config/auth" -H "Authorization: Bearer $TOKEN" \
  | jq '{site_url, uri_allow_list}' | tee "$SCRATCH/bl14-auth-before.json"
```
Expected (from spec 010 row D2): `site_url` = `https://uat-holigay-yyc.vercel.app`; `uri_allow_list` = `https://holigay-yyc-git-dev-owen-roses-projects.vercel.app/**,https://uat-holigay-yyc.vercel.app/**`. If `site_url` is something else, stop and show Owen the file before writing.

- [x] **Step 3: Build the new allow-list and PATCH (same Bash call)**

Copies every entry that names the old UAT host, rewrites the host, and appends — so the shape (`/**` or not) always matches what is already there:

```bash
OLD=$(jq -r .uri_allow_list "$SCRATCH/bl14-auth-before.json")
ADD=$(printf '%s' "$OLD" | tr ',' '\n' | grep 'uat-holigay-yyc\.vercel\.app' \
      | sed 's#uat-holigay-yyc\.vercel\.app#training.holigayeventsyyc.ca#' | paste -sd,)
test -n "$ADD" || { echo "no uat entry to mirror — stop"; exit 1; }
case ",$OLD," in *",training.holigayeventsyyc.ca"*|*"//training.holigayeventsyyc.ca"*) NEW="$OLD";; *) NEW="$OLD,$ADD";; esac
jq -n --arg s 'https://training.holigayeventsyyc.ca' --arg l "$NEW" '{site_url:$s, uri_allow_list:$l}' \
  | curl -sS -X PATCH "https://api.supabase.com/v1/projects/$REF/config/auth" \
      -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d @- \
  | jq '{site_url, uri_allow_list}'
```
Expected: the PATCH response echoes `site_url` = `https://training.holigayeventsyyc.ca` and an allow-list with **three** entries (git-dev, uat vercel.app, training). An error body `{"message": …}` means nothing changed — read it and stop.

- [x] **Step 4: Read back (same Bash call)**

```bash
curl -sS "https://api.supabase.com/v1/projects/$REF/config/auth" -H "Authorization: Bearer $TOKEN" \
  | jq '{site_url, uri_allow_list}' | tee "$SCRATCH/bl14-auth-after.json"
diff <(jq -S . "$SCRATCH/bl14-auth-before.json") <(jq -S . "$SCRATCH/bl14-auth-after.json")
```
Expected: `diff` shows exactly the two changed lines. Keep both files for the backlog record (values only, no token).

---

### Task 6: End-to-end check of an emailed link on the new host

**Files:** none

- [x] **Step 1: Request a password reset on the new host**

`tabs_create_mcp`, `navigate` to `https://training.holigayeventsyyc.ca/forgot-password`. Type the `+uat-org` organizer address (Owen's; ask him for it if it is not in the session — do not guess it). Submit. Screenshot. Expected: the form is replaced by "If that address has an account, a reset link is on its way."

- [x] **Step 2: Owen opens the mail**

Ask Owen to open the reset mail and report (or paste) the link host. Expected: sender `noreply@holigayeventsyyc.ca`; link host **`training.holigayeventsyyc.ca`** with path `/auth/confirm?...type=recovery...`. If the host is still `uat-holigay-yyc.vercel.app`, Task 5 did not take — re-run its Step 4 read-back.

- [x] **Step 3: Follow the link**

Owen clicks it in Chrome (or pastes it and I `navigate`). Screenshot. Expected: lands signed in on `https://training.holigayeventsyyc.ca/set-password`. He may cancel here or set a password; either way then load `/dashboard` and confirm it renders for the organizer.

- [x] **Step 4: Confirm the old hosts and prod are untouched**

```bash
for h in uat-holigay-yyc.vercel.app vendors.holigayeventsyyc.ca; do curl -s -o /dev/null -w "$h %{http_code}\n" "https://$h/"; done
for n in vendors send rsend resend._domainkey; do printf '%-18s %s\n' "$n" "$(dig +short "$n.holigayeventsyyc.ca" CNAME | tr '\n' ' ')"; done
diff <(grep -v '^training' "$SCRATCH/bl14-baseline.txt" | head -4) <(for n in vendors send rsend resend._domainkey; do printf '%-18s CNAME %s\n' "$n" "$(dig +short "$n.holigayeventsyyc.ca" CNAME | tr '\n' ' ')"; done)
```
Expected: both hosts `200`; the `diff` is empty.

- [x] **Step 5: Close the Chrome tabs this session opened**

`tabs_close_mcp` for each tab id created in Tasks 2, 3 and 6.

---

### Task 7: Docs PR to `dev`

**Files:**
- Modify: `CLAUDE.md:213` (the "Production is live" paragraph, sentence beginning "The training deployment")
- Modify: `docs/backlog/2026-10-06-uat-and-go-live.md` (Phase 4 list, after the BL-13 entry, before the `---` that precedes "## Deferred")
- Modify: `specs/010-invite-only-uat/quickstart.md:74` (row D2 — append a note)
- Modify: `docs/superpowers/plans/2026-10-09-uat-custom-domain-plan.md` (tick the boxes)

- [x] **Step 1: CLAUDE.md**

Replace, in the paragraph at line 213:

```
The training deployment `uat-holigay-yyc.vercel.app` (Vercel Preview of `dev`, dev Supabase project) has been invite-only
```
with
```
The training deployment `training.holigayeventsyyc.ca` (Vercel branch domain for `dev` since 2026-10-DD — BL-14; `uat-holigay-yyc.vercel.app` still resolves; dev Supabase project) has been invite-only
```
(`DD` = the real day.)

- [x] **Step 2: Backlog entry**

Insert after the BL-13 block (keep the list's indentation style — six spaces on continuation lines):

```
- [x] **BL-14** (added and run 2026-10-DD) — Serve the training deployment at
      `training.holigayeventsyyc.ca`: Vercel branch domain (Preview / `dev`) on the
      `holigay-yyc` project, one GoDaddy CNAME `training` → `<VERCEL_CNAME_TARGET>`, dev
      Supabase `site_url` → the new host and the host appended to `uri_allow_list`.
      Design: `docs/superpowers/specs/2026-10-09-uat-custom-domain-design.md`; plan:
      `docs/superpowers/plans/2026-10-09-uat-custom-domain-plan.md`.
      Owner: joint (agent drives Chrome + Management API, Owen signed in) · Shape: dashboards +
      API + docs PR · Blocked by: nothing · Done when: an emailed link's host is the new domain.
      **Record (2026-10-DD).** Vercel row Valid Configuration, HTTPS 200; `/signup` 404 on
      the new host (invite-only intact); Management API read-back `site_url` =
      `https://training.holigayeventsyyc.ca`, allow-list = git-dev, uat vercel.app, training;
      `/forgot-password` for `+uat-org` → mail link host `training.holigayeventsyyc.ca` →
      `/set-password` signed in → `/dashboard`. `vendors`/`send`/`rsend`/`resend._domainkey`
      unchanged (dig diff empty). Pass.
```
Fill `<VERCEL_CNAME_TARGET>` and the dates with the real values.

- [x] **Step 3: 010 quickstart row D2**

Append to the end of the D2 row's last cell (before the final `| ☑ |`):

```
 **Superseded 2026-10-DD (BL-14):** `site_url` → `https://training.holigayeventsyyc.ca`; `uri_allow_list` gained `https://training.holigayeventsyyc.ca/**` (the two earlier origins kept).
```

- [x] **Step 4: Tick this plan's boxes and run the gate**

Run: `cd /home/wrenn/Github/Holigay-YYC && npm run lint && npm test && npm run build`
Expected: lint clean, all unit tests pass (the security project self-skips without a local stack), build succeeds.

- [x] **Step 5: Commit and open the PR**

```bash
git add CLAUDE.md docs/backlog/2026-10-06-uat-and-go-live.md specs/010-invite-only-uat/quickstart.md docs/superpowers/plans/2026-10-09-uat-custom-domain-plan.md
git commit -m "docs: training deployment on training.holigayeventsyyc.ca — BL-14 record, CLAUDE.md, 010 D2 note [BL-14]"
git push -u origin bl-14-uat-custom-domain
gh pr create --base dev --title "docs: training deployment on training.holigayeventsyyc.ca [BL-14]" --body-file - <<'MD'
Serves the `dev` branch at `training.holigayeventsyyc.ca` (Vercel branch domain, Preview). Config was changed in the dashboards and the Supabase Management API; this PR records it.

- CLAUDE.md phase paragraph names the new host
- Backlog BL-14 added with the evidence record
- 010 quickstart D2 annotated (site_url / allow-list superseded)
- Design and plan docs under docs/superpowers/

No code, no migration, no package changes. Gate: lint, test, build green locally.
MD
```
Expected: PR URL printed; CI green. Owen reviews and merges. No `dev → main` promotion is needed (docs and Preview-only config).
