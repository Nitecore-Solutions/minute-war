import { getSettings } from "@/lib/settings";
import { fmtDate, fmtNumber } from "@/lib/admin";
import { query } from "@/lib/db";
import type { RowDataPacket } from "mysql2/promise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Settings editor.
 *
 * Everything here is read at request time by the API, so a change is live
 * within seconds without an app release. The coin values are the ones to be
 * careful with: they feed straight into the economy.
 */
export default async function AdminSettings({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const ok = typeof sp.ok === "string" ? sp.ok : null;
  const error = typeof sp.error === "string" ? sp.error : null;
  const s = await getSettings();

  const lastChanged = fmtDate(new Date());

  const counts = await query<RowDataPacket & { n: number }>(
    "SELECT COUNT(*) n FROM users WHERE role = 'player'"
  );
  const registeredCount = Number(counts[0]?.n ?? 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">
            Read at request time by the API — a change goes live without an app release
          </p>
        </div>
      </div>

      {ok ? (
        <div className="card" style={{ marginBottom: 16, borderColor: "#86efac", background: "#f0fdf4" }}>
          {ok}
        </div>
      ) : null}
      {error ? <div className="error-text">{error}</div> : null}

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))" }}>
        {/* ---------------- kill switches ---------------- */}
        <section className="card">
          <h2 style={{ margin: "0 0 4px", fontSize: 16 }}>Live controls</h2>
          <p className="page-sub" style={{ marginBottom: 14 }}>
            The two switches worth having your finger on when something goes wrong.
          </p>

          <Flag
            name="maintenance"
            label="Maintenance mode"
            hint="Blocks sign-in and gameplay. Existing screens show the app is briefly down."
            value={Boolean(s.maintenance)}
          />
          <Flag
            name="registrations_open"
            label="Accept new sign-ups"
            hint="Turn off to stop growth without affecting existing players."
            value={Boolean(s.registrations_open)}
          />
          <Flag
            name="ads_enabled"
            label="Ads enabled"
            hint="Global kill switch for every ad placement."
            value={Boolean(s.ads_enabled)}
          />
        </section>

        {/* ---------------- economy ---------------- */}
        <section className="card">
          <h2 style={{ margin: "0 0 4px", fontSize: 16 }}>Coin economy</h2>
          <p className="page-sub" style={{ marginBottom: 14 }}>
            Change these and the live figures on the dashboard shift. Coins are not
            cashable, so this is a progression knob rather than a liability.
          </p>

          <NumberSetting
            name="coin_signup_bonus"
            label="Sign-up bonus"
            hint="Paid once, on first registration."
            value={Number(s.coin_signup_bonus ?? 500)}
          />
          <NumberSetting
            name="coin_daily_login"
            label="Daily login bonus"
            hint="Idempotent: signing in repeatedly on one day pays once."
            value={Number(s.coin_daily_login ?? 50)}
          />
          <NumberSetting
            name="coin_invite"
            label="Invite bonus"
            hint="Paid to the inviter when a friend joins with their code."
            value={Number(s.coin_invite ?? 200)}
          />
          <NumberSetting
            name="daily_game_count"
            label="Games per daily run"
            hint="How many of the enabled games each player gets per day."
            value={Number(s.daily_game_count ?? 3)}
          />
          <NumberSetting
            name="premium_price_inr"
            label="Premium price (₹/month)"
            hint="Display only until a billing provider is connected."
            value={Number(s.premium_price_inr ?? 79)}
          />
        </section>

        {/* ---------------- branding ---------------- */}
        <section className="card">
          <h2 style={{ margin: "0 0 4px", fontSize: 16 }}>Branding &amp; sharing</h2>
          <p className="page-sub" style={{ marginBottom: 14 }}>
            The share copy is the single highest-leverage line in the product: it is what
            appears in every WhatsApp message.
          </p>

          <TextSetting
            name="app_name"
            label="App name"
            value={String(s.app_name ?? "MINUTE WAR")}
          />
          <TextSetting
            name="tagline"
            label="Tagline"
            value={String(s.tagline ?? "")}
          />
          <form method="post" action="/api/admin/settings" style={{ marginBottom: 16 }}>
            <input type="hidden" name="intent" value="set" />
            <input type="hidden" name="key" value="share_text" />
            <label className="field">
              <span className="field-label">Share message template</span>
              <textarea className="textarea" name="value" defaultValue={String(s.share_text ?? "")} />
              <span className="hint" style={{ display: "block", marginTop: 4 }}>
                Placeholders:{" "}
                <code className="mono">{"{score}"}</code>,{" "}
                <code className="mono">{"{name}"}</code>,{" "}
                <code className="mono">{"{link}"}</code>
              </span>
            </label>
            <button className="btn btn-primary btn-sm" type="submit">Save share template</button>
          </form>

          <div className="card" style={{ background: "#f8fafc", padding: 12 }}>
            <div className="field-label" style={{ marginBottom: 6 }}>Preview</div>
            <div style={{ fontSize: 13, lineHeight: 1.5 }}>
              {String(s.share_text ?? "")
                .replace("{score}", "9,820")
                .replace("{name}", "Nitish")
                .replace("{link}", "minutewar.in/c/AB12CD")}
            </div>
          </div>
        </section>

        {/* ---------------- read-only ---------------- */}
        <section className="card">
          <h2 style={{ margin: "0 0 4px", fontSize: 16 }}>Environment</h2>
          <p className="page-sub" style={{ marginBottom: 14 }}>
            Read-only. Secrets are deliberately not shown here.
          </p>

          <table>
            <tbody>
              <tr>
                <td style={{ color: "#64748b" }}>Database</td>
                <td className="mono" style={{ textAlign: "right" }}>
                  {redactUrl(process.env.DATABASE_URL)}
                </td>
              </tr>
              <tr>
                <td style={{ color: "#64748b" }}>API port</td>
                <td className="mono" style={{ textAlign: "right" }}>{process.env.PORT ?? "3000"}</td>
              </tr>
              <tr>
                <td style={{ color: "#64748b" }}>WebSocket port</td>
                <td className="mono" style={{ textAlign: "right" }}>{process.env.WS_PORT ?? "3002"}</td>
              </tr>
              <tr>
                <td style={{ color: "#64748b" }}>Share base URL</td>
                <td className="mono" style={{ textAlign: "right" }}>
                  {process.env.SHARE_BASE_URL ?? process.env.APP_ORIGIN ?? "not set"}
                </td>
              </tr>
              <tr>
                <td style={{ color: "#64748b" }}>Players registered</td>
                <td className="mono" style={{ textAlign: "right" }}>
                  {fmtNumber(registeredCount)}
                </td>
              </tr>
              <tr>
                <td style={{ color: "#64748b" }}>Checked</td>
                <td className="mono" style={{ textAlign: "right" }}>
                  {lastChanged}
                </td>
              </tr>
            </tbody>
          </table>

          <p className="hint">
            The share base URL is what turns a challenge code into a link a friend can
            tap. Set it to your live domain before publishing anything.
          </p>
        </section>
      </div>
    </>
  );
}

async function Flag({
  name,
  label,
  hint,
  value,
}: {
  name: string;
  label: string;
  hint: string;
  value: boolean;
}) {
  return (
    <form
      method="post"
      action="/api/admin/settings"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 0",
        borderBottom: "1px solid #f1f5f9",
      }}
    >
      <input type="hidden" name="intent" value="flag" />
      <input type="hidden" name="key" value={name} />
      <input type="hidden" name="value" value={value ? "false" : "true"} />

      <div>
        <div className="field-label" style={{ marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 11, color: "#64748b" }}>{hint}</div>
      </div>

      <button
        className={`btn btn-sm ${value ? "" : "btn-primary"}`}
        type="submit"
        style={{ minWidth: 92 }}
      >
        {value ? "On" : "Off"}
      </button>
    </form>
  );
}

function NumberSetting({
  name,
  label,
  hint,
  value,
}: {
  name: string;
  label: string;
  hint: string;
  value: number;
}) {
  return (
    <form method="post" action="/api/admin/settings" style={{ marginBottom: 14 }}>
      <input type="hidden" name="intent" value="set" />
      <input type="hidden" name="key" value={name} />
      <label className="field" style={{ marginBottom: 6 }}>
        <span className="field-label">{label}</span>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="input" name="value" type="number" min={0} defaultValue={value} />
          <button className="btn btn-sm" type="submit" style={{ flexShrink: 0 }}>
            Save
          </button>
        </div>
        <span className="hint" style={{ display: "block", marginTop: 3 }}>{hint}</span>
      </label>
    </form>
  );
}

function TextSetting({ name, label, value }: { name: string; label: string; value: string }) {
  return (
    <form method="post" action="/api/admin/settings" style={{ marginBottom: 14 }}>
      <input type="hidden" name="intent" value="set" />
      <input type="hidden" name="key" value={name} />
      <label className="field" style={{ marginBottom: 6 }}>
        <span className="field-label">{label}</span>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="input" name="value" defaultValue={value} />
          <button className="btn btn-sm" type="submit" style={{ flexShrink: 0 }}>
            Save
          </button>
        </div>
      </label>
    </form>
  );
}

/** Shows host and database but never the password. */
function redactUrl(url: string | undefined): string {
  if (!url) return "not set";
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}/${parsed.pathname.replace(/^\//, "")} (${parsed.protocol.replace(":", "")})`;
  } catch {
    return "configured";
  }
}