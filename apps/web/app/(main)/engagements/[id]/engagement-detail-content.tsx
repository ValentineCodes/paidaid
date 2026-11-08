import Link from "next/link";

import { FigmaIcon } from "../../../../components/figma-icons";
import { formatPostedRelative } from "../../../../lib/datetime/relative-from-now";
import type { Database } from "../../../../lib/database.types";
import type { EngagementFundingPrepareResult } from "../../../../lib/engagement/funding-types";
import type { EngagementSettlementView } from "../../../../lib/engagement/settlement-types";
import { EngagementFundingSection } from "./engagement-funding-section";
import { EngagementSettlementSection } from "./engagement-settlement-section";
import { EngagementWorkflow } from "./engagement-workflow";

type DeliveryAttachmentRow =
  Database["public"]["Tables"]["delivery_attachments"]["Row"];
type DeliveryRow = Database["public"]["Tables"]["deliveries"]["Row"];
type ReviewRow = Database["public"]["Tables"]["reviews"]["Row"];

export type EngagementDetailContentProps = {
  nowMs: number;
  engagementId: string;
  engagementStatus: Database["public"]["Enums"]["engagement_status"];
  scheduledForDay: string;
  createdAt: string;
  isProvider: boolean;
  title: string;
  description: string | null;
  budgetHuman: string;
  assetSymbol: string;
  paymentFunded: boolean;
  locationKind: Database["public"]["Enums"]["location_kind"] | null;
  locationLabel: string | null;
  deadlineAt: string | null;
  peerDisplayName: string;
  peerPhotoUrl: string | null;
  peerPhone: string | null;
  conversationId: string | null;
  linkedRequesterNear: string | null;
  fundingTerms: EngagementFundingPrepareResult | null;
  fundingPrerequisites: {
    requesterWalletLinked: boolean;
    providerWalletLinked: boolean;
    requesterDisplayName: string;
    providerDisplayName: string;
    requesterNearAccountId: string | null;
    providerNearAccountId: string | null;
  } | null;
  initialSettlement: EngagementSettlementView | null;
  delivery: DeliveryRow | null;
  deliveryAttachments: DeliveryAttachmentRow[];
  existingReview: ReviewRow | null;
  hasProfilePhoto: boolean;
  tagLabels: string[];
};

function formatLocationLine(
  locationKind: EngagementDetailContentProps["locationKind"],
  locationLabel: string | null,
): string {
  if (locationKind === "online") {
    return "Online";
  }
  if (locationKind === "unspecified" || !locationKind) {
    return "Not specified";
  }
  return locationLabel?.trim() || "In person";
}

function formatDeadlineLabel(deadlineAt: string | null): string {
  if (!deadlineAt) {
    return "Flexible";
  }
  const d = new Date(deadlineAt);
  if (Number.isNaN(d.getTime())) {
    return "—";
  }
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function statusBadgeLabel(
  status: Database["public"]["Enums"]["engagement_status"],
): string {
  if (status === "completed") {
    return "Completed";
  }
  return "In progress";
}

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "?";
}

function EngagementOfferCard({
  amount,
  whenDetail,
  locationLabel,
  funded,
}: {
  amount: string;
  whenDetail: string;
  locationLabel: string;
  funded: boolean;
}) {
  return (
    <div className="engagement-offer-card">
      <div className="engagement-offer-card__offer">
        <small>Offer</small>
        <strong>{amount}</strong>
        {funded ? (
          <span className="engagement-offer-card__funded">Funded in escrow</span>
        ) : (
          <span className="engagement-offer-card__pending">Awaiting funding</span>
        )}
      </div>
      <div aria-hidden className="engagement-offer-card__divider" />
      <div className="engagement-offer-card__cols">
        <div>
          <small>
            <FigmaIcon name="clock" size={14} /> When
          </small>
          <span>{whenDetail}</span>
        </div>
        <div>
          <small>
            <FigmaIcon name="pin" size={14} /> Location
          </small>
          <span>{locationLabel}</span>
        </div>
      </div>
    </div>
  );
}

function EngagementCallout({
  tone,
  title,
  children,
}: {
  tone: "info" | "warning";
  title: string;
  children: string;
}) {
  return (
    <div
      className={`engagement-callout engagement-callout--${tone}`}
      role="note"
    >
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}

export function EngagementDetailContent(props: EngagementDetailContentProps) {
  const {
    nowMs,
    engagementId,
    engagementStatus,
    scheduledForDay,
    createdAt,
    isProvider,
    title,
    description,
    budgetHuman,
    assetSymbol,
    paymentFunded,
    locationKind,
    locationLabel,
    deadlineAt,
    peerDisplayName,
    peerPhotoUrl,
    conversationId,
    linkedRequesterNear,
    fundingTerms,
    fundingPrerequisites,
    initialSettlement,
    delivery,
    deliveryAttachments,
    existingReview,
    hasProfilePhoto,
    tagLabels,
  } = props;

  const screenTitle = isProvider ? "Request" : "Your request";
  const startedAt = new Date(createdAt);
  const metaTime = Number.isNaN(startedAt.getTime())
    ? "—"
    : formatPostedRelative(startedAt, nowMs);
  const locationLine = formatLocationLine(locationKind, locationLabel);
  const whenDetail = formatDeadlineLabel(deadlineAt);
  const showPaymentSecured =
    !isProvider && paymentFunded && engagementStatus === "active";
  return (
    <div className="inner-page engagement-flow">
      <p className="engagement-flow__eyebrow">{screenTitle}</p>

      <p className="engagement-flow__meta">
        <span
          className={`engagement-status-pill${engagementStatus === "completed" ? " engagement-status-pill--done" : ""}`}
        >
          {statusBadgeLabel(engagementStatus)}
        </span>
        <time dateTime={createdAt}>{metaTime}</time>
      </p>

      <h1 className="engagement-flow__title">{title}</h1>
      {description?.trim() ? (
        <p className="engagement-flow__description">{description.trim()}</p>
      ) : null}

      <EngagementOfferCard
        amount={`${budgetHuman} ${assetSymbol}`}
        whenDetail={whenDetail}
        locationLabel={locationLine}
        funded={paymentFunded}
      />

      {tagLabels.length > 0 ? (
        <p className="engagement-flow__tags">{tagLabels.join(" · ")}</p>
      ) : null}

      <section className="engagement-flow__section">
        <div className="engagement-person-card">
          <div className="avatar large shrink-0">
            {peerPhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={peerPhotoUrl}
                alt=""
                className="size-full rounded-full object-cover"
              />
            ) : (
              initialsFromName(peerDisplayName)
            )}
          </div>
          <div className="engagement-person-card__body">
            <strong className="engagement-person-card__name">
              {peerDisplayName}
            </strong>
          </div>
          {conversationId ? (
            <Link
              href={`/conversations/${conversationId}`}
              className="engagement-person-card__chat"
              aria-label={`Chat with ${peerDisplayName}`}
            >
              <span className="engagement-connect-icon" aria-hidden>
                <FigmaIcon name="send" size={20} />
              </span>
            </Link>
          ) : (
            <span
              className="engagement-person-card__chat engagement-person-card__chat--disabled"
              aria-hidden
            >
              <span className="engagement-connect-icon">
                <FigmaIcon name="send" size={20} />
              </span>
            </span>
          )}
        </div>
      </section>

      {showPaymentSecured ? (
        <EngagementCallout tone="info" title="Payment secured">
          Release payment only after the work is complete.
        </EngagementCallout>
      ) : null}

      {isProvider &&
        engagementStatus === "active" &&
        !paymentFunded &&
        !(fundingPrerequisites?.providerWalletLinked ?? false) && (
          <EngagementCallout tone="warning" title="Wallet needed">
            The requester cannot fund escrow until you sign in with your NEAR
            wallet.
          </EngagementCallout>
        )}

      {!isProvider && engagementStatus === "active" && !paymentFunded && (
        <div className="detail-section">
          <EngagementFundingSection
            engagementId={engagementId}
            initialTerms={fundingTerms}
            linkedRequesterNearAccountId={linkedRequesterNear}
            initialPrerequisites={fundingPrerequisites}
          />
        </div>
      )}

      {paymentFunded && (
        <div className="detail-section">
          <EngagementSettlementSection
            engagementId={engagementId}
            isRequester={!isProvider}
            linkedRequesterNearAccountId={linkedRequesterNear}
            initialSettlement={initialSettlement}
          />
        </div>
      )}

      <div className="detail-section engagement-workflow-wrap">
        <h4>Delivery &amp; completion</h4>
        <EngagementWorkflow
          engagementId={engagementId}
          conversationId={conversationId}
          isProvider={isProvider}
          isRequester={!isProvider}
          engagementStatus={engagementStatus}
          delivery={delivery}
          deliveryAttachments={deliveryAttachments}
          existingReview={existingReview}
          hasProfilePhoto={hasProfilePhoto}
        />
      </div>
    </div>
  );
}
