import { connection } from "next/server";

import { createClient } from "../../lib/supabase/server";
import { SiteHeaderMarketplace } from "../../components/site-header-marketplace";
import { isSupabaseConfigured } from "../../lib/supabase/env";

/** Opt out of prerender for cookie/session-backed header (cacheComponents). */
export const instant = false;

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();

  let user: { email: string; id: string } | null = null;
  let unreadNotifications = 0;
  if (isSupabaseConfigured()) {
    try {
      const supabase = await createClient();
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (authUser) {
        user = {
          id: authUser.id,
          email: authUser.email ?? "",
        };
        const { count } = await supabase
          .from("notifications")
          .select("*", { count: "exact", head: true })
          .eq("user_id", authUser.id)
          .is("read_at", null);
        unreadNotifications = count ?? 0;
      }
    } catch {
      /* Session read failed — treat as signed out */
    }
  }

  return (
    <>
      <SiteHeaderMarketplace
        user={user}
        unreadNotifications={unreadNotifications}
      />
      {children}
    </>
  );
}
