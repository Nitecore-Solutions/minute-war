import { handler, ok } from "@/lib/http";
import { query } from "@/lib/db";
import { getSettingsFresh } from "@/lib/settings";
import type { RowDataPacket } from "mysql2/promise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/ads/config
 *
 * Which ad placements are live, and which AdMob unit each one should use.
 *
 * WHY THIS IS SERVER-DRIVEN
 * -------------------------
 * Ad unit ids and on/off switches change often: a new campaign, a placement
 * that turns out to hurt retention, an AdMob account under review. If those
 * lived in the app they would need a Play Store release each time, which is a
 * multi-hour turnaround for what should be an instant switch.
 *
 * The client asks here at startup, and falls back to showing no ads if this
 * call fails. Ad config is therefore something the admin dashboard can change
 * live.
 */
export async function GET() {
  return handler(async () => {
    // Read fresh, not through the cached settings helper: this switch has to take
    // effect the moment an admin flips it.
    const settings = await getSettingsFresh();
    const globallyEnabled = settings.ads_enabled === true;

    const placements = await query<
      RowDataPacket & {
        id: number;
        placement: string;
        provider: string;
        unit_id: string | null;
        enabled: number;
      }
    >("SELECT id, placement, provider, unit_id, enabled FROM ad_config ORDER BY id");

    return ok({
      // False means the app should render no ad slots at all.
      enabled: globallyEnabled,
      placements: placements.map((row) => ({
        id: row.placement,
        // A placement with no unit id cannot render anything, so it is
        // reported as off even when the checkbox is ticked. That keeps a
        // half-configured placement from showing an empty grey box.
        active:
          globallyEnabled && Boolean(row.enabled) && Boolean(row.unit_id),
        unitId: row.unit_id,
        provider: row.provider,
      })),
    });
  });
}