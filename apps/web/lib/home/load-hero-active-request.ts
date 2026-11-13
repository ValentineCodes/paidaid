import type { createClient } from "../supabase/server";

export type HeroActiveRequest = {
  title: string;
  href: string;
};

type Client = Awaited<ReturnType<typeof createClient>>;

export async function loadHeroActiveRequest(
  supabase: Client,
  userId: string,
): Promise<HeroActiveRequest | null> {
  const { data: assignmentRows } = await supabase
    .from("assignments")
    .select(
      `
      engagements ( id, status, updated_at ),
      requests ( id, title )
    `,
    )
    .or(`requester_id.eq.${userId},provider_user_id.eq.${userId}`);

  let activeEngagement: { updatedAt: string; id: string; title: string } | null =
    null;

  for (const row of assignmentRows ?? []) {
    const typed = row as {
      engagements:
        | { id: string; status: string; updated_at: string }
        | { id: string; status: string; updated_at: string }[]
        | null;
      requests: { id: string; title: string } | null;
    };
    const engRaw = typed.engagements;
    const eng = Array.isArray(engRaw) ? engRaw[0] : engRaw;
    const title = typed.requests?.title;
    if (!eng || eng.status !== "active" || !title) {
      continue;
    }
    if (
      !activeEngagement ||
      eng.updated_at > activeEngagement.updatedAt
    ) {
      activeEngagement = {
        updatedAt: eng.updated_at,
        id: eng.id,
        title,
      };
    }
  }

  if (activeEngagement) {
    return {
      title: activeEngagement.title,
      href: `/engagements/${activeEngagement.id}`,
    };
  }

  const { data: openRequest } = await supabase
    .from("requests")
    .select("id, title")
    .eq("requester_id", userId)
    .in("status", ["open", "assigned"])
    .not("published_at", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (openRequest) {
    return {
      title: openRequest.title,
      href: `/requests/${openRequest.id}`,
    };
  }

  return null;
}
