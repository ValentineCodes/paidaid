"use server";

import { createClient } from "../../../lib/supabase/server";

export type EngagementFundingPrerequisites = {
  requesterWalletLinked: boolean;
  providerWalletLinked: boolean;
  requesterDisplayName: string;
  providerDisplayName: string;
  requesterNearAccountId: string | null;
  providerNearAccountId: string | null;
};

export async function loadEngagementFundingPrerequisites(
  engagementId: string,
): Promise<
  { ok: true; data: EngagementFundingPrerequisites } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in required." };
  }

  const { data, error } = await supabase.rpc(
    "get_engagement_funding_prerequisites",
    { p_engagement_id: engagementId },
  );

  if (error) {
    return { ok: false, error: error.message };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return { ok: false, error: "Could not load funding prerequisites." };
  }

  return {
    ok: true,
    data: {
      requesterWalletLinked: Boolean(row.requester_wallet_linked),
      providerWalletLinked: Boolean(row.provider_wallet_linked),
      requesterDisplayName: row.requester_display_name ?? "Requester",
      providerDisplayName: row.provider_display_name ?? "Provider",
      requesterNearAccountId: row.requester_near_account_id ?? null,
      providerNearAccountId: row.provider_near_account_id ?? null,
    },
  };
}
