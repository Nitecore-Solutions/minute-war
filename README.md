# MINUTE WAR

**60 Seconds. One Challenge. Can You Beat Me?**

India's 60-second challenge game. One app, six mini games, a daily run, and a
friend-challenge loop that drives sharing.

---

## Quick start

```bash
# 1. Database (MySQL 8 must be running)
node backend/scripts/migrate.mjs
node backend/scripts/create-admin.mjs --email owner@minutewar.in --password "choose-something"

# 2. Install
cd backend && npm install && cd ..
cd mobile  && npm install && cd ..

# 3. Run everything
npm start
```

Then:

| | |
|---|---|
| Admin dashboard | http://localhost:3000/admin |
| API health | http://localhost:3000/api/health |
| WebSocket | ws://localhost:3002 |
| Expo | scan the QR with Expo Go |

`npm start` checks the database, starts the API and the realtime server, then
launches Expo. Ctrl+C stops all of it.

### Testing on a physical phone

`localhost` on a phone means the phone itself. Set this in `mobile/.env`:

```
EXPO_PUBLIC_API_URL=http://<your-PC-LAN-IP>:3000/api
```

Or use the Cloudflare tunnels, which work over mobile data:

```powershell
npm run tunnels          # rewrites mobile/.env with public URLs
cd mobile; npx expo start --clear
```

---

## Layout

```
game-app/
├── backend/
│   ├── db/migrations/        MySQL schema + seed (plain .sql, Workbench-friendly)
│   ├── public/celebrities/   Generated close-up crops + attribution
│   ├── scripts/              migrate, seed, create-admin, image build, test suites
│   └── src/
│       ├── app/
│       │   ├── (public)/     Landing, privacy, terms, delete-account
│       │   ├── admin/        Browser dashboard (12 pages, route-grouped)
│       │   └── api/          Mobile REST API + account deletion
│       ├── lib/              db pool, auth, wallet, games, settings
│       ├── proxy.ts          Admin route guard
│       └── ws-server/        Real-time battle server (not deployed initially)
├── mobile/                   Expo app
│   ├── assets/               Icon, adaptive/monochrome icon, splash
│   ├── eas.json              Preview APK + production AAB profiles
│   ├── scripts/              Reproducible icon/splash generator
│   └── src/
│       ├── screens/          Includes DeleteAccountScreen
│       ├── games/            The six mini games + shared registry
│       ├── context/          Auth + realtime
│       └── services/api.ts
└── tools/                    start scripts, cloudflared
```

---

## How it works

### The daily run

Every player gets the **same three games and the same seed** on a given day.
That is deliberate: the product depends on "your score vs mine" being a fair
comparison, so the game set cannot be randomised per person. Category coverage
is guaranteed rather than left to chance — a purely random 3-from-6 left the
India quiz out too often.

### Scoring and trust

| Game | Where the score is decided |
|---|---|
| India Quiz | **Server.** The answer key is never sent to the client. |
| Celeb Close-Up | Client, with the question's answer index revealed for instant feedback. |
| Reaction / Tap / Colour / Memory | Client, clamped to the game's `max_score`. |

The quiz is re-graded from a server-held key on submit, so a modified client
gains nothing by lying about it. The tap-based games are inherently
client-reported because the physics of a tap cannot live on a server; the
server clamps them. Celeb Close-Up needs a local answer key to show right/wrong
and the full portrait immediately, and it is clamped the same way. **If coin
value per game rises materially, that is where anti-cheat work belongs.** This
is called out in the schema, the API and the game code for exactly that reason.

### Celeb Close-Up images

The game shows four crops cut from one portrait (eyes, nose, lips, hair), then
reveals the full photo once the player answers. The images are generated at
build time, not by the app:

```bash
cd backend
node scripts/build-celeb-images.mjs                 # all 47 celebrities
node scripts/build-celeb-images.mjs --force         # ignore cached downloads
node scripts/build-celeb-images.mjs --only=alia-bhatt,shah-rukh-khan --force
```

The script searches Wikipedia / Wikimedia Commons, scores candidate faces with
OpenCV's YuNet detector, crops the four features plus a reveal portrait, and
writes:

- `backend/public/celebrities/celeb-closeup/<slug>/*.jpg`
- `backend/public/celebrities/celeb-closeup/ATTRIBUTION.md`
- `backend/db/migrations/0003_celeb_closeup.sql`

It needs Python with `opencv-python-headless` and an internet connection. QA
contact sheets are written to `backend/.cache/qa/` for visual review; the cache
is not committed. Re-run the migration after a rebuild to seed any new
questions.

The Commons licences (many are CC BY or CC BY-SA) are recorded per image in
`ATTRIBUTION.md`. Keep that file with the app. Publicity / personality rights
are separate from copyright and still need review before a store release.

### Coins

Every movement goes through `sp_credit_wallet` / `sp_debit_wallet` stored
procedures. The ledger is append-only and is the financial audit trail — it is
`ON DELETE RESTRICT` on purpose, so account deletion goes through
`sp_close_account`, which scrubs personal data and zeroes the wallet while
keeping every ledger row.

Coins are progression currency only. There is no withdraw path anywhere in the
product.

### Realtime

A standalone `ws` server on :3002. It owns **when** a battle starts and **who
wins**; it never decides **what is correct**. Questions go out without the
answer key, and answers are graded against a key the server already holds. A
replayed answer for the same question is ignored, so points cannot be farmed.

---

## Commands

```bash
npm run db:migrate     # apply migrations
npm run db:reset       # drop + reapply (dev only)
npm run db:seed -- 30  # 30 demo players, password Demo12345
npm run admin:create -- --email you@you.com
npm run db:query -- "SELECT 1"

npm test               # 52 schema + 65 API + 17 realtime + 25 admin + 20 ad
npm run test:schema    # schema and stored procedures
npm run test:encoding  # utf8mb4 round-trip
```

The API and realtime suites need the servers running (`npm start`).

**If a device suddenly can't reach the server** — your Wi-Fi address changed.
This is the single most common cause of "Failed to fetch":

```bash
cd backend
npm run ip                        # prints the right address, tests it
node scripts/set-api-url.mjs      # writes it into mobile/.env
```

`npm start` now does this automatically.

---

## Ads

AdMob is wired in, but **it cannot run in Expo Go**. The Google Mobile Ads SDK
is native code and Expo Go is a fixed prebuilt binary that does not contain it.
That is a hard platform limit, not something that can be configured away.

| Environment | Ad slots |
|---|---|
| Expo Go | render nothing; everything else works normally |
| Development build | real test ads appear |
| Play Store build | live ads, once real unit ids are set |

`AdBanner` probes for the native module at runtime and returns `null` when it
is missing, so the app stays fully usable in Expo Go. It also loads the ads
package with a lazy `require` inside a function rather than a module-scope
`import` — importing a native package where the module is missing throws at
load time and would crash the entire app rather than just skipping the ad.

### See test ads

Google's test unit ids are already seeded. Just build a development build:

```bash
cd mobile
npx expo prebuild --clean
npx expo run:android          # or: eas build --profile development
```

Install that on the phone instead of Expo Go. Everything else behaves
identically; the ad slots now render.

### Go live

1. Create the app in [AdMob](https://admob.google.com)
2. Add **Android** and **iOS** apps using your package name / bundle id
3. Create a **banner** ad unit, copy its id
4. Open `/admin/sponsors` → **Ad placements** → paste the id → **Enable**
5. Live on next app launch. **No app release needed.**

Unit ids and on/off switches live in the database, not the binary, so pulling a
placement is instant. `/admin/settings` → **Ads enabled** is a global kill
switch that overrides every individual placement, and it takes effect the next
time the app is opened or foregrounded — not after a restart.

> **Do not paste a real unit id while developing.** Serving live ads from a
> debug build makes Google see your own testers clicking real ads, which is how
> accounts get suspended for invalid traffic. Keep the test ids until you are
> cutting a release build.

```bash
cd backend
npm run ads:test    # restore Google's test ids
npm run ads:off     # disable every placement
```

---

## Production wiring (Android → Render → Aiven)

One Render service serves the whole backend. There is no separate admin deploy
and no WebSocket service for the first release.

```
Android app (EAS AAB)
   │  HTTPS + JSON, Authorization: Bearer <JWT>
   ▼
https://<service>.onrender.com
   ├── /api/*        mobile REST API
   ├── /admin        operator dashboard (httpOnly cookie)
   ├── /privacy      public privacy policy
   ├── /terms        public terms of use
   └── /delete-account  public account-deletion form
             │
             ▼
        Aiven MySQL (TLS)
```

The mobile app only learns **one** URL: `EXPO_PUBLIC_API_URL`, which must end in
`/api`. `webUrl()` in `mobile/src/services/api.ts` strips that suffix to open
`/privacy`, `/terms` and `/delete-account` on the same Render host. No second
website URL or WebSocket URL is baked into the app. Secrets (`DATABASE_URL`,
`JWT_SECRET`) exist only in Render's environment.

### 1. Aiven MySQL

Create a free MySQL service and copy its **Service URI**. It will look like:

```
mysql://avnadmin:...@mysql-....aivencloud.com:PORT/defaultdb?ssl-mode=REQUIRED
```

The backend detects `ssl-mode=REQUIRED` and turns it into a mysql2 TLS
connection. Aiven's project CA is self-signed, so Node normally cannot verify it
out of the box. Download the CA from Aiven Console (or reuse the
`DB_SSL_CA_BASE64` value from `backend/.env`) and set it in Render, together with
`DB_SSL=true`. Do not turn off verification just to get past a TLS error.

### 2. Render web service

Create a **Web Service** from `Nitecore-Solutions/minute-war`, root directory
`backend`, runtime Node.

| Setting | Value |
|---|---|
| Build command | `npm ci --include=dev && npm run build` |
| Start command | `npx next start -p $PORT` |
| Health check | `/api/health` |
| Instance | Free for testing, Starter before launch |

Add the values from `backend/.env.production.example` in the Render Environment
tab. The important ones:

```
NODE_ENV=production
DATABASE_URL=mysql://...
DB_SSL=true
DB_SSL_CA_BASE64=<Aiven CA base64>
DB_POOL_SIZE=5
JWT_SECRET=<32+ random characters>
JWT_TTL_DAYS=30
APP_ORIGIN=https://<service>.onrender.com
SHARE_BASE_URL=https://<service>.onrender.com
```

Render Free has no shell, so run migrations and create the admin from your
machine with `DATABASE_URL` pointed at Aiven:

```bash
cd backend
npm run db:migrate
npm run admin:create -- --email owner@minutewar.in --password "use-a-long-password"
```

Never run `db:reset` or `db:seed` against production: both destroy or insert
demo data. After the first deploy check `/api/health`, sign in at `/admin`, and
open `/privacy`, `/terms` and `/delete-account`.

### 3. EAS build and Play submission

`mobile/eas.json` defines `preview` (internal APK) and `production` (AAB,
auto-incrementing version code). Both force `EXPO_PUBLIC_ENABLE_BATTLES=false`.

```bash
cd mobile
npx eas-cli init                 # link the Expo project once
npx eas-cli env:create --name EXPO_PUBLIC_API_URL \
  --value https://<service>.onrender.com/api \
  --environment production --visibility plaintext

npx eas-cli build --platform android --profile preview

# after preview testing:
npx eas-cli build --platform android --profile production
npx eas-cli submit --platform android --profile production
```

The `production` profile loads EAS's `production` environment, so the API URL is
not committed. For a local EAS build, copy `mobile/.env.production.example` to
`mobile/.env.production` and fill it in instead. Rebuild after changing any
`EXPO_PUBLIC_*` value; it is inlined into the binary.

EAS submission expects a Play service-account JSON at
`mobile/google-play-service-account.json`; that file is gitignored. Create the
key in Google Cloud/Play Console and never commit it.

### 4. Play Store release checklist

- [ ] Public privacy URL and account-deletion URL (this service provides both)
- [ ] In-app deletion path: Profile → Delete account
- [ ] Production API URL in the EAS `production` environment; battles false
- [ ] Real AdMob **app ID** in `mobile/app.json` (currently Google's test ID)
      and real unit IDs in `/admin/sponsors`
- [ ] App icon, adaptive icon, monochrome icon and splash (in `mobile/assets/`)
- [ ] Target Android 16 / API 36
- [ ] Data safety, ads, content rating and news declarations completed
- [ ] Closed testing: 12 testers opted in for 14 continuous days (new personal
      Play accounts)
- [ ] Physical-device test on a clean install, including account deletion
- [ ] Confirm celebrity image licences **and** publicity/personality rights
- [ ] Change the admin password and set a production `JWT_SECRET`

Render Free sleeps after 15 minutes and can take 30–60 seconds to wake. Upgrade
the API service to Starter before the store release. If battles return later,
deploy a **separate** Render Web Service for `src/ws-server/index.mjs`; Vercel
and serverless functions cannot hold persistent WebSocket rooms.

### 5. Account deletion

Both paths call `POST /api/account/delete`, which verifies the current password
and runs `sp_close_account`:

- **App:** Profile → Delete account → password + `DELETE`
- **Web:** `/delete-account` → email + password + `DELETE`

The procedure revokes every session, scrubs name/email/city/state/referral
code/password hash, freezes and zeroes the wallet, and keeps the coin ledger
with the original account ID as the financial audit trail. The old email can be
reused for a new account.

---

## Notes

`BUILD_NOTES.md` records the design decisions and the sharp edges already hit
in this codebase — mysql2's tuple returns, MySQL's `DELIMITER`, stored
procedure OUT parameters, and the Next.js 16 route-group rule for the admin
login. Read it before changing anything in the money or auth paths.