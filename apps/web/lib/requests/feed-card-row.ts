import type { Tables } from "../database.types";

/** Row shape from discovery feed — reused for instant request drawer preview. */
export type FeedCardRow = {
  id: string;
  title: string;
  description_preview: string | null;
  timing_type: Tables<"requests">["timing_type"];
  scheduled_at: string | null;
  deadline_at: string | null;
  budget_amount: string | number;
  asset_symbol: string;
  asset_decimals: number;
  location_kind: Tables<"requests">["location_kind"];
  location_label: string | null;
  published_at: string | null;
  tags: unknown;
  first_photo_path: string | null;
};
