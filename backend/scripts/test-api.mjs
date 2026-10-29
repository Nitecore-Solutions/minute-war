/**
 * End-to-end API test against a running dev server.
 *
 *   cd backend; npm run dev      (in another terminal)
 *   node scripts/test-api.mjs
 *
 * Exercises the full player journey: signup -> daily challenge -> challenges
 * -> leaderboard -> logout. Exits non-zero on the first failure.
 */

const BASE = process.env.API_BASE ?? "http://localhost:3000/api";

let pass = 0;
let fail = 0;

function check(label, condition, detail = "") {
  if (condition) {
    pass += 1;
    console.log(`  ok    ${label}${detail ? ` (${detail})` : ""}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ""}`);
  }
}

/** Calls the API and never throws, so a 4xx can be asserted on. */
async function call(path, { method = "GET", token, body, idem } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (idem) headers["Idempotency-Key"] = idem;

  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, ...json };
  } catch (err) {
    return { status: 0, error: String(err) };
  }
}

const email = `e2e_${Date.now()}@minutewar.test`;
const password = "E2eTest#2026";

console.log("\n== health ==");
const health = await call("/health");
check("server is up", health.status === 200, `status ${health.status}`);
check("database reachable", health.data?.database === "up");

console.log("\n== signup ==");
const signup = await call("/auth/signup", {
  method: "POST",
  body: { name: "E2E Player", email, password, city: "Pune", state: "Maharashtra" },
});
check("signup succeeds", signup.status === 201, `status ${signup.status} ${signup.error ?? ""}`);
check("player id assigned", Boolean(signup.data?.user?.playerId), String(signup.data?.user?.playerId));
check("signup bonus paid", signup.data?.signupBonus === 500, String(signup.data?.signupBonus));
const token = signup.data?.token;
check("token issued", typeof token === "string" && token.length > 50);

console.log("\n== signup validation ==");
// The name must be valid too, otherwise this asserts the name rule rather
// than the duplicate-email rule.
check(
  "duplicate email rejected",
  (await call("/auth/signup", {
    method: "POST",
    body: { name: "Duplicate Name", email, password },
  })).status === 409
);
check(
  "short password rejected",
  (await call("/auth/signup", { method: "POST", body: { name: "S", email: `x_${Date.now()}@t.in`, password: "abc" } })).status === 400
);
check(
  "bad email rejected",
  (await call("/auth/signup", { method: "POST", body: { name: "B", email: "not-an-email", password } })).status === 400
);
check(
  "missing fields rejected",
  (await call("/auth/signup", { method: "POST", body: {} })).status === 400
);

console.log("\n== login ==");
const login = await call("/auth/login", { method: "POST", body: { email, password } });
check("login succeeds", login.status === 200);
check(
  "balance reflects both bonuses",
  login.data?.wallet?.balance === 550,
  `got ${login.data?.wallet?.balance}, expected 550 (500 signup + 50 login)`
);
const loginToken = login.data?.token;

const relogin = await call("/auth/login", { method: "POST", body: { email, password } });
check(
  "daily login is idempotent",
  relogin.data?.wallet?.balance === 550,
  `got ${relogin.data?.wallet?.balance}, expected 550 (no double pay)`
);

check(
  "wrong password rejected",
  (await call("/auth/login", { method: "POST", body: { email, password: "wrong-password" } })).status === 401
);
check(
  "unknown email rejected",
  (await call("/auth/login", { method: "POST", body: { email: "nobody@nowhere.test", password } })).status === 401
);

console.log("\n== session ==");
const me = await call("/auth/me", { token: loginToken });
check("me returns the user", me.data?.user?.email === email);
check("me returns the wallet", typeof me.data?.wallet?.balance === "number");
check("me requires a token", (await call("/auth/me")).status === 401);
check(
  "garbage token rejected",
  (await call("/auth/me", { token: "not.a.jwt" })).status === 401
);

console.log("\n== logout ==");
await call("/auth/logout", { method: "POST", token: loginToken });
check(
  "token revoked after logout",
  (await call("/auth/me", { token: loginToken })).status === 401
);
check(
  "the other session still works",
  (await call("/auth/me", { token })).status === 200
);

console.log("\n== daily challenge ==");
const run = await call("/game/daily", { token });
check("daily run available", run.status === 200, run.error ?? "");
check("picks 3 games", run.data?.games?.length === 3, `got ${run.data?.games?.length}`);
check("has a seed", typeof run.data?.seed === "string");

const indiaGame = run.data?.games?.find((g) => g.category === "india");
check("includes an India-category game", Boolean(indiaGame), indiaGame?.code ?? "");

console.log("\n== question bank ==");
const questions = await call("/game/questions?code=india-quiz&count=5", { token });
check("question bank serves questions", questions.data?.questions?.length > 0);
check(
  "questions carry 4 options",
  (questions.data?.questions ?? []).every((q) => Array.isArray(q.options) && q.options.length === 4)
);
check(
  "quiz answer key is never sent",
  (questions.data?.questions ?? []).every((q) => !("correctIndex" in q))
);

console.log("\n== celeb close-up ==");
const catalogue = await call("/games");
check("catalogue lists every game", catalogue.data?.games?.length === 6, `got ${catalogue.data?.games?.length}`);
check(
  "catalogue includes celeb-closeup",
  (catalogue.data?.games ?? []).some((g) => g.code === "celeb-closeup")
);

const celebQuestions = await call("/game/questions?code=celeb-closeup&count=10", { token });
const celebList = celebQuestions.data?.questions ?? [];
const firstCeleb = celebList[0];
check("celeb questions load", celebList.length > 0, `${celebList.length} rows`);
check(
  "celeb questions carry all four crops",
  Boolean(firstCeleb?.media?.eyes && firstCeleb?.media?.nose && firstCeleb?.media?.lips && firstCeleb?.media?.hair)
);
check("celeb questions carry a reveal portrait", Boolean(firstCeleb?.media?.reveal));
check(
  "celebrity name is stripped from media",
  Boolean(firstCeleb?.media) && !("celebrity" in firstCeleb.media)
);
check("celeb answer index is sent for local feedback", typeof firstCeleb?.correctIndex === "number");

if (firstCeleb?.media?.eyes) {
  const imageUrl = new URL(firstCeleb.media.eyes, BASE.replace(/\/api$/, "")).href;
  const image = await fetch(imageUrl).catch(() => null);
  check(
    "celeb crop is served as an image",
    Boolean(image?.ok) && /^image\//.test(image?.headers.get("content-type") ?? ""),
    `${imageUrl} -> ${image?.status ?? "network error"}`
  );
}

console.log("\n== submitting a run ==");
const submit = await call("/game/daily/submit", {
  method: "POST",
  token,
  body: {
    seed: run.data?.seed,
    scores: run.data?.games?.map((g) => ({
      gameCode: g.code,
      score: 1000,
      durationMs: g.durationSeconds * 1000,
    })),
  },
});
check("run submits", submit.status === 200, submit.error ?? "");
check("total score returned", typeof submit.data?.totalScore === "number", String(submit.data?.totalScore));
check("coins awarded", submit.data?.coinsEarned > 0, String(submit.data?.coinsEarned));
check("percentile returned", submit.data?.percentile !== undefined, String(submit.data?.percentile));

const submitAgain = await call("/game/daily/submit", {
  method: "POST",
  token,
  body: {
    seed: run.data?.seed,
    scores: run.data?.games?.map((g) => ({
      gameCode: g.code,
      score: 1000,
      durationMs: 1000,
    })),
  },
});
check(
  "resubmitting the same run pays once",
  submitAgain.data?.coinsAwarded === false || submitAgain.data?.coinsEarned === 0,
  `coinsEarned=${submitAgain.data?.coinsEarned}`
);

console.log("\n== challenges ==");
const created = await call("/challenges", {
  method: "POST",
  token,
  body: { score: submit.data?.totalScore ?? 3000, gameCodes: run.data?.games?.map((g) => g.code) },
});
check("challenge created", created.status === 201, created.error ?? "");
check("has a share code", typeof created.data?.code === "string", String(created.data?.code));
check(
  "share link is built",
  typeof created.data?.shareUrl === "string" && created.data.shareUrl.includes("challenge"),
  created.data?.shareUrl
);

const second = await call("/auth/signup", {
  method: "POST",
  body: { name: "Challenger", email: `e2e_b_${Date.now()}@minutewar.test`, password },
});
const challengerToken = second.data?.token;

const opened = await call(`/challenges/${created.data?.code}`, { token: challengerToken });
check("friend can open the challenge", opened.status === 200, opened.error ?? "");
check("shows the opponent score", opened.data?.challengerScore === (submit.data?.totalScore ?? 3000));

const accepted = await call(`/challenges/${created.data?.code}/accept`, {
  method: "POST",
  token: challengerToken,
  body: { score: (submit.data?.totalScore ?? 3000) + 500 },
});
check("challenge resolves", accepted.status === 200, accepted.error ?? "");
check("higher score wins", accepted.data?.won === true, `won=${accepted.data?.won}`);

const challengeList = await call("/challenges", { token: challengerToken });
check("my challenges lists it", (challengeList.data?.challenges ?? []).length > 0);

console.log("\n== leaderboard ==");
const board = await call("/leaderboard?scope=daily");
check("daily leaderboard loads", board.status === 200, board.error ?? "");
check("has entries", (board.data?.entries ?? []).length > 0, `${board.data?.entries?.length} rows`);
check(
  "entries are ordered by score",
  (board.data?.entries ?? []).every((e, i, arr) => i === 0 || arr[i - 1].score >= e.score)
);

console.log("\n== wallet ==");
const wallet = await call("/wallet", { token });
check("wallet loads", wallet.status === 200);
check("ledger has entries", (wallet.data?.transactions ?? []).length > 0);
check(
  "balance equals the newest ledger row",
  (() => {
    const t = wallet.data?.transactions ?? [];
    return t.length === 0 || t[0].balanceAfter === wallet.data?.balance;
  })(),
  `balance=${wallet.data?.balance} newest=${wallet.data?.transactions?.[0]?.balanceAfter}`
);

console.log("\n== access control ==");
check("daily needs auth", (await call("/game/daily")).status === 401);
check("wallet needs auth", (await call("/wallet")).status === 401);
check(
  "player cannot reach admin",
  (await call("/admin/stats", { token: loginToken })).status === 403
);

console.log(`\n${fail === 0 ? "ALL API TESTS PASSED" : `${fail} TEST(S) FAILED`}  (${pass} passed)\n`);
process.exit(fail === 0 ? 0 : 1);