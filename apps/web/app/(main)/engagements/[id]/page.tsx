import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";

import { createClient } from "../../../../lib/supabase/server";
import { isSupabaseConfigured } from "../../../../lib/supabase/env";
import { getRequestWallTimeMs } from "../../../../lib/datetime/request-wall-time";
import { resolveProfileDisplayUrl } from "../../../../lib/profiles/resolve-photo";
import { normalizeDbNumericAmount } from "@paidaid/shared";
import {
  formatBudgetSmallestUnits,
  normalizeAssetDecimals,
} from "../../../../lib/requests/format-budget";
import { loadMilestoneReleaseQueue } from "../milestone-settlement-actions";
import { EngagementDetailContent } from "./engagement-detail-content";
import type { EngagementSettlementView } from "../../../../lib/engagement/settlement-types";
import { loadActiveLinkedNearWallet } from "../../../../lib/near/load-linked-wallet";
import type { Database } from "../../../../lib/database.types";

type DeliveryAttachmentRow =
  Database["public"]["Tables"]["delivery_attachments"]["Row"];

type PageProps = { params: Promise<{ id: string }> };

export default async function EngagementPage({ params }: PageProps) {
  const { id } = await params;

  if (!isSupabaseConfigured()) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-stone-600 dark:text-stone-400">
          Supabase is not configured.
        </p>
      </main>
    );
  }

  await connection();
  const nowMs = getRequestWallTimeMs();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/wallet?next=/engagements/${id}`);
  }

  const { data: engagement, error: eErr } = await supabase
    .from("engagements")
    .select(
      `
      id,
      status,
      scheduled_for_day,
      created_at,
      auto_complete_deadline_at,
      auto_completed_at,
      completed_at,
      payment_mode,
      assignments (
        request_id,
        accepted_response_id,
        requester_id,
        provider_user_id
      )
    `,
    )
    .eq("id", id)
    .maybeSingle();

  if (eErr || !engagement) {
    notFound();
  }

  const assignment = engagement.assignments as {
    request_id: string;
    accepted_response_id: string;
    requester_id: string;
    provider_user_id: string;
  } | null;

  if (
    !assignment ||
    (assignment.requester_id !== user.id &&
      assignment.provider_user_id !== user.id)
  ) {
    notFound();
  }

  const isProvider = assignment.provider_user_id === user.id;
  const peerId = isProvider
    ? assignment.requester_id
    : assignment.provider_user_id;

  const { data: requestRow } = await supabase
    .from("requests")
    .select(
      "title, description, budget_amount, budget_asset_id, location_kind, location_label, timing_type, scheduled_at, deadline_at, expires_at, published_at",
    )
    .eq("id", assignment.request_id)
    .maybeSingle();

  const { data: accepted } = await supabase
    .from("request_responses_api")
    .select(
      `
      proposed_amount,
      proposed_asset_id,
      assets!request_responses_proposed_asset_id_fkey ( symbol, decimals )
    `,
    )
    .eq("id", assignment.accepted_response_id)
    .maybeSingle();

  const asset = accepted?.assets as {
    symbol: string;
    decimals: number;
  } | null;

  const { data: peerProfile } = await supabase
    .from("profiles")
    .select("display_name, avatar_url, live_profile_photo_path")
    .eq("id", peerId)
    .maybeSingle();

  const peerPhotoUrl = await resolveProfileDisplayUrl(supabase, peerProfile);

  let peerPhone: string | null = null;
  const { data: canRead } = await supabase.rpc("can_read_private_contact", {
    p_target_user: peerId,
  });
  if (canRead === true) {
    const { data: pc } = await supabase
      .from("profile_private_contact")
      .select("phone")
      .eq("user_id", peerId)
      .maybeSingle();
    peerPhone = pc?.phone ?? null;
  }

  const { data: conv } = await supabase
    .from("conversations")
    .select("id")
    .eq("engagement_id", id)
    .eq("kind", "engagement")
    .maybeSingle();

  const { data: delivery } = await supabase
    .from("deliveries")
    .select("*")
    .eq("engagement_id", id)
    .maybeSingle();

  let deliveryAttachments: DeliveryAttachmentRow[] = [];

  if (delivery) {
    const { data: att } = await supabase
      .from("delivery_attachments")
      .select("*")
      .eq("delivery_id", delivery.id)
      .order("sort_order", { ascending: true });
    deliveryAttachments = att ?? [];
  }

  const { data: reviewRow } = await supabase
    .from("reviews")
    .select("*")
    .eq("engagement_id", id)
    .maybeSingle();

  const budgetStr =
    accepted && asset
      ? formatBudgetSmallestUnits(
          accepted.proposed_amount,
          normalizeAssetDecimals(asset.decimals),
        )
      : "";

  const { data: tagRows } = await supabase
    .from("request_tags")
    .select("tags ( label )")
    .eq("request_id", assignment.request_id);
  const tagLabels = (tagRows ?? [])
    .map((row) => {
      const tags = row.tags as { label: string } | null;
      return tags?.label?.trim() ?? "";
    })
    .filter((label) => label.length > 0);

  const { data: paymentRow } = await supabase
    .from("engagement_escrow_payments")
    .select("*")
    .eq("engagement_id", id)
    .maybeSingle();

  const { data: paymentAsset } = paymentRow
    ? await supabase
        .from("assets")
        .select("asset_standard, token_contract_id, symbol, decimals")
        .eq("id", paymentRow.asset_id)
        .maybeSingle()
    : { data: null };

  let linkedRequesterNear: string | null = null;
  let linkedProviderNear: string | null = null;
  let fundingPrerequisites: {
    requesterWalletLinked: boolean;
    providerWalletLinked: boolean;
    requesterDisplayName: string;
    providerDisplayName: string;
    requesterNearAccountId: string | null;
    providerNearAccountId: string | null;
  } | null = null;

  if (!isProvider) {
    linkedRequesterNear =
      (await loadActiveLinkedNearWallet(supabase, user.id))?.nearAccountId ??
      null;

    const { data: prerequisites } = await supabase.rpc(
      "get_engagement_funding_prerequisites",
      { p_engagement_id: id },
    );
    const row = Array.isArray(prerequisites)
      ? prerequisites[0]
      : prerequisites;
    if (row) {
      fundingPrerequisites = {
        requesterWalletLinked: Boolean(row.requester_wallet_linked),
        providerWalletLinked: Boolean(row.provider_wallet_linked),
        requesterDisplayName: row.requester_display_name ?? "Requester",
        providerDisplayName: row.provider_display_name ?? "Provider",
        requesterNearAccountId: row.requester_near_account_id ?? null,
        providerNearAccountId: row.provider_near_account_id ?? null,
      };
    }

  }

  const paymentFunded = paymentRow?.status === "funded";

  let initialSettlement: EngagementSettlementView | null = null;
  if (paymentRow) {
    initialSettlement = {
      settlementStatus: paymentRow.settlement_status,
      settlementEligibleAt: paymentRow.settlement_eligible_at,
      settlementTrigger: paymentRow.settlement_trigger,
      releaseTxHash: paymentRow.release_tx_hash,
      releasedAt: paymentRow.released_at,
      settlementLastError: paymentRow.settlement_last_error,
      paymentFunded: paymentRow.status === "funded",
      onChainEscrowId:
        paymentRow.on_chain_escrow_id == null
          ? null
          : String(paymentRow.on_chain_escrow_id),
      requesterNearAccountId: paymentRow.requester_near_account_id,
      providerNearAccountId: paymentRow.provider_near_account_id,
      escrowContractId: paymentRow.escrow_contract_id,
      amountSmallestUnits:
        paymentAsset != null
          ? normalizeDbNumericAmount(paymentRow.amount)
          : null,
    };
  }

  const paymentMode =
    (engagement.payment_mode ?? "single") as Database["public"]["Enums"]["engagement_payment_mode"];

  let engagementMilestones: {
    id: string;
    position: number;
    title: string;
    description: string;
    amountSmallest: string;
    status: Database["public"]["Enums"]["milestone_workflow_status"];
    latestDelivery: {
      deliveryId: string;
      description: string;
      attachments: {
        id: string;
        storage_path: string;
        mime_type: string;
      }[];
    } | null;
  }[] = [];

  let milestoneReleaseQueue: Awaited<
    ReturnType<typeof loadMilestoneReleaseQueue>
  > = null;

  if (paymentMode === "milestones" && paymentFunded) {
    milestoneReleaseQueue = await loadMilestoneReleaseQueue(id);
  }

  if (paymentMode === "milestones") {
    const { data: msRows } = await supabase
      .from("engagement_milestones")
      .select("id, position, title, description, amount, status")
      .eq("engagement_id", id)
      .order("position");

    const milestoneIds = msRows?.map((row) => row.id) ?? [];
    const latestDeliveryByMilestone = new Map<
      string,
      { deliveryId: string; description: string }
    >();

    if (milestoneIds.length > 0) {
      const { data: deliveryRows } = await supabase
        .from("milestone_deliveries")
        .select("id, milestone_id, description, revision_sequence")
        .in("milestone_id", milestoneIds)
        .order("revision_sequence", { ascending: false });

      for (const row of deliveryRows ?? []) {
        if (!latestDeliveryByMilestone.has(row.milestone_id)) {
          latestDeliveryByMilestone.set(row.milestone_id, {
            deliveryId: row.id,
            description: row.description ?? "",
          });
        }
      }
    }

    const deliveryIds = [...latestDeliveryByMilestone.values()].map(
      (d) => d.deliveryId,
    );
    const attachmentsByDelivery = new Map<
      string,
      { id: string; storage_path: string; mime_type: string }[]
    >();

    if (deliveryIds.length > 0) {
      const { data: attRows } = await supabase
        .from("milestone_delivery_attachments")
        .select("id, milestone_delivery_id, storage_path, mime_type, sort_order")
        .in("milestone_delivery_id", deliveryIds)
        .order("sort_order");

      for (const att of attRows ?? []) {
        const list = attachmentsByDelivery.get(att.milestone_delivery_id) ?? [];
        list.push({
          id: att.id,
          storage_path: att.storage_path,
          mime_type: att.mime_type,
        });
        attachmentsByDelivery.set(att.milestone_delivery_id, list);
      }
    }

    engagementMilestones =
      msRows?.map((row) => {
        const latest = latestDeliveryByMilestone.get(row.id);
        return {
          id: row.id,
          position: row.position,
          title: row.title,
          description: row.description ?? "",
          amountSmallest: normalizeDbNumericAmount(row.amount),
          status: row.status,
          latestDelivery: latest
            ? {
                deliveryId: latest.deliveryId,
                description: latest.description,
                attachments:
                  attachmentsByDelivery.get(latest.deliveryId) ?? [],
              }
            : null,
        };
      }) ?? [];
  }

  if (isProvider) {
    linkedProviderNear =
      (await loadActiveLinkedNearWallet(supabase, user.id))?.nearAccountId ??
      null;
    const { data: prerequisites } = await supabase.rpc(
      "get_engagement_funding_prerequisites",
      { p_engagement_id: id },
    );
    const prow = Array.isArray(prerequisites)
      ? prerequisites[0]
      : prerequisites;
    if (prow) {
      fundingPrerequisites = {
        requesterWalletLinked: Boolean(prow.requester_wallet_linked),
        providerWalletLinked: Boolean(prow.provider_wallet_linked),
        requesterDisplayName: prow.requester_display_name ?? "Requester",
        providerDisplayName: prow.provider_display_name ?? "Provider",
        requesterNearAccountId: prow.requester_near_account_id ?? null,
        providerNearAccountId: prow.provider_near_account_id ?? null,
      };
    }
  }

  return (
    <EngagementDetailContent
      nowMs={nowMs}
      engagementId={id}
      engagementStatus={engagement.status}
      scheduledForDay={engagement.scheduled_for_day}
      createdAt={engagement.created_at}
      isProvider={isProvider}
      title={requestRow?.title ?? "Engagement"}
      description={requestRow?.description ?? null}
      budgetHuman={budgetStr}
      assetSymbol={asset?.symbol ?? ""}
      paymentFunded={paymentFunded}
      locationKind={requestRow?.location_kind ?? null}
      locationLabel={requestRow?.location_label ?? null}
      deadlineAt={requestRow?.deadline_at ?? null}
      peerDisplayName={peerProfile?.display_name ?? "Member"}
      peerPhotoUrl={peerPhotoUrl}
      peerPhone={peerPhone}
      conversationId={conv?.id ?? null}
      linkedRequesterNear={linkedRequesterNear}
      linkedProviderNear={linkedProviderNear}
      fundingPrerequisites={fundingPrerequisites}
      initialSettlement={initialSettlement}
      delivery={delivery}
      deliveryAttachments={deliveryAttachments}
      existingReview={reviewRow}
      tagLabels={tagLabels}
      paymentMode={paymentMode}
      engagementMilestones={engagementMilestones}
      milestoneReleaseQueue={milestoneReleaseQueue}
      assetDecimals={asset?.decimals ?? 24}
    />
  );
}
