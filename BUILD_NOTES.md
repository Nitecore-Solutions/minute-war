# MINUTE WAR — build notes

## Stack (deliberately mirrors `coin-game`, with Postgres → MySQL)

| Layer | Choice |
|---|---|
| Mobile | Expo SDK 57, RN 0.86, React 19.2, React Navigation 7, expo-haptics/linear-gradient/svg, lucide-react-native, AsyncStorage |
| Backend + Admin | Next.js 16 App Router, React 19.2, TS strict, Tailwind v4, `jose` JWT + bcryptjs, zod |
| Realtime | standalone `ws` server on **:3002** (Next owns :3000) |
| Database | **MySQL 8.0** via `mysql2` connection pool, migrations + stored procedures |
| Ops | PowerShell `tools/` scripts, Cloudflare quick tunnels |

## Status

- [x] MySQL 8 provisioned (`minute_war` db + least-privilege app user)
- [x] `0001_init.sql` — 22 tables, 7 procedures, seed data
- [x] `0002_seed_questions.sql` — 50 India questions
- [x] `0003_celeb_closeup.sql` — media column, Celeb Close-Up game + image questions
- [x] Backend lib: db pool, auth, http, ids, settings, wallet, games, seed, admin
- [x] API: auth, game daily + questions + submit, challenges, leaderboard, wallet, admin stats
- [x] WebSocket battle server — 17 tests passing
- [x] Admin dashboard — 12 pages, production build clean (36 routes)
- [x] Mobile app — 10 screens, 6 games, auth, realtime, share loop
- [x] Auto-downloaded celebrity crops + attribution (Wikimedia Commons, YuNet)
- [x] AdMob — server-driven placements, admin control, Expo Go safe
- [x] tools/ start scripts (start-all.ps1, start-tunnels.ps1) + LAN IP self-heal
- [x] README.md, .env examples, seed data

**All suites passing: 52 schema + 58 API + 17 realtime + 25 admin + 20 ad + 14 encoding.**
Both TS projects compile clean. `next build` produces 37 routes.

## Test commands

```bash
node scripts/verify-schema.mjs   # 52 DB/procedure assertions
node scripts/test-api.mjs        # 58 API assertions (needs dev server)
node scripts/test-ws.mjs         # 17 realtime assertions (needs ws server)
```

## Local credentials

- Admin dashboard: `http://localhost:3000/admin` — `owner@minutewar.in` / `MinWar#2026`
- Demo players: password `Demo12345`
- MySQL: `minute_war` / `Mw#2026_Local!xQ7` @ 127.0.0.1:3306

## Mobile app notes

- **Most games live in `mobile/src/games/index.tsx`** and are reached through
  `renderGame(code, props)`; Celeb Close-Up has its own component in the same
  folder. Quick play and the daily run both go through the registry, so a game
  can never behave differently in the two places. Adding a game is one
  component plus one switch case.
- **Celeb Close-Up images are generated, never hand-cropped.**
  `backend/scripts/build-celeb-images.mjs` downloads Commons portraits, picks
  the best face with OpenCV YuNet, cuts eyes/nose/lips/hair plus a portrait,
  and regenerates `0003_celeb_closeup.sql`. Review `backend/.cache/qa/` before
  shipping; keep `ATTRIBUTION.md` with the app.
- **Timers are measured against a wall-clock deadline**, not an interval count.
  React Native throttles or pauses timers when the app is backgrounded, so a
  60-second game driven by `setInterval` would silently run long.
- **`RealtimeContext` owns the only WebSocket.** One socket shared by every
  screen, with exponential backoff *and jitter* so a fleet of clients does not
  retry in lockstep after the server restarts.
- **Battles are optional at build time.** Set
  `EXPO_PUBLIC_ENABLE_BATTLES=true` only when the WebSocket server is available.
  When it is false or omitted, the app never opens a socket and hides the
  battle/challenge buttons, screens and online counts. Daily runs, quick play,
  wallet, profile and the HTTP leaderboard are unaffected.
- **The socket is opened only while signed in and battles are enabled**, and is
  torn down on sign-out, so a revoked token is never left connected.
- **Expo Web uses `AdBanner.web.tsx`.** Metro statically follows the lazy
  native-ad require even though it only runs on native, which otherwise fails
  the web bundle with a native-only module error. The `.web.tsx` stub renders
  nothing, matching the Expo Go path, and keeps `npm run web` available for
  layout checks.
- `EXPO_PUBLIC_*` values are inlined at build time. Changing `mobile/.env` does
  NOT change an installed app — it must be rebuilt.

## Gotchas already hit (do not repeat)

1. **`DELIMITER` is a client-side directive.** It cannot be sent over the wire.
   `scripts/lib/split-sql.mjs` parses it so the `.sql` files stay importable
   in Workbench by hand.
2. **Triggers need SUPER** when `log_bin` is on. So `player_id` and
   `referral_code` are assigned in application code with a retry loop, not a
   `BEFORE INSERT` trigger. This also keeps managed MySQL hosts working.
3. **`query()` in `lib/db.ts` returns the rows array directly.** Do NOT write
   `const [rows] = await query(...)` — that yields the first ROW, and `.map`
   on it throws. (Only the raw `pool.query`/`conn.query` returns a tuple.)
4. **A `CALL` whose body has no `SELECT` returns a flat OkPacket**, and the
   OUT parameters are silently lost. `callProcedure()` therefore issues a
   `SELECT @p_out...` immediately after the CALL.
5. **OUT params must be listed in the CALL as `@name`**, never as `?`.
6. **Never drop the database in `--reset`.** It leaves the connection with no
   default schema. Drop procedures first, then tables.
7. **`wallet_ledger` is `ON DELETE RESTRICT` on purpose.** It is the audit
   trail. Account deletion goes through `sp_close_account`, which scrubs PII
   and zeroes the wallet while keeping every ledger row.
8. **The SQL splitter must strip only the delimiter, not the whole line** —
   `) ENGINE=InnoDB ...;` puts real SQL on the terminator's line.
9. **`IN (?)` with a JS array throws in mysql2.** Expand placeholders instead.
   A throw before the broadcast leaves clients stuck on a finished battle.
10. **`/admin/login` must sit OUTSIDE the protected admin layout.** The
    dashboard pages live in a `(dashboard)` route group; otherwise the
    layout's redirect and the proxy redirect fight and the browser spins.
11. **Never `router.replace()` + `router.refresh()` in sequence.** In the App
    Router the refresh cancels the in-flight transition and the page hangs on
    "Rendering..." forever, with any submit button stuck on its busy label. The
    admin login and sign-out both use `window.location.assign()` instead: the
    session lives in an httpOnly cookie, so the protected layout can only see
    it on a fresh document request anyway. `test-admin-login.mjs` asserts this
    so it cannot come back.
12. **A `?from=` redirect target must never be the login page itself**, or the
    proxy bounce and the login form bounce each other forever. The login form
    strips any `/admin/login` prefix before navigating.
13. **Never `import` a native package at module scope.** The ads SDK is absent
    in Expo Go, and importing it there throws at load time and crashes the
    whole app rather than skipping the ad. `AdBanner` uses a lazy `require`
    inside a function, gated on a `NativeModules` probe. `test-ads.mjs`
    asserts this so it cannot come back.
14. **Ad config is server-driven and re-read on foreground.** Unit ids and
    on/off switches live in `ad_config`, and `/api/ads/config` reads settings
    through `getSettingsFresh()` rather than the cached helper. A kill switch
    that lags five seconds behind the cached read, or that only takes effect
    after an app restart, is not a kill switch.

## Design decisions worth remembering

- **The server grades quiz answers.** `correct_index` is never sent to any
  quiz client. Celeb Close-Up opts in to `correctIndex` through its game config
  because it shows right/wrong and the portrait immediately; like the other
  action games its score is client-reported and clamped. Tap/reaction games
  remain client-reported; that is where anti-cheat work should go if coin value
  rises.
- **Battle questions exclude image questions.** `media IS NULL` is enforced in
  both battle question queries so the existing battle UI never receives a
  question it cannot render.
- **Everyone gets the same daily game set and seed.** Randomising per player
  would make "your score vs mine" meaningless.
- **Daily game picks guarantee category coverage.** A purely random 3-from-6
  left the India category out too often.
- **Coins only pay when a run beats the day's best**, and the idempotency key
  makes a replay a no-op. `coinsEarned` reports what actually landed, not
  what the score was worth.
- **Admin coin changes always go through the wallet procedures**, so the
  dashboard cannot create ledger gaps.