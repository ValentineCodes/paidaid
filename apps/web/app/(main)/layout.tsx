import { connection } from "next/server";

import { createClient } from "../../lib/supabase/server";
import { SiteHeaderMarketplace } from "../../components/site-header-marketplace";
import { readNearPublicEnv } from "../../lib/near/near-public-env";
import { NearSessionProvider } from "../../wallet/near-session-provider";
import { loadActiveLinkedNearWallet } from "../../lib/near/load-linked-wallet";
import { MobileNav } from "../../components/mobile-nav";
import { ModalSlotGate } from "../../components/modal-slot-gate";
import { loadHeaderUser } from "../../lib/profiles/header-user";
import { isSupabaseConfigured } from "../../lib/supabase/env";
import type { HeaderUser } from "../../lib/profiles/header-user";

/** Opt out of prerender for cookie/session-backed header (cacheComponents). */
export const instant = false;

export default async function MainLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  await connection();

  let user: HeaderUser | null = null;
  let linkedNearAccountId: string | null = null;
  let unreadNotifications = 0;
  if (isSupabaseConfigured()) {
    try {
      const supabase = await createClient();
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (authUser) {
        user = await loadHeaderUser(supabase, authUser);
        const linked = await loadActiveLinkedNearWallet(supabase, authUser.id);
        linkedNearAccountId = linked?.nearAccountId ?? null;
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

  const nearPublicEnv = readNearPublicEnv();

  return (
    <NearSessionProvider nearPublicEnv={nearPublicEnv}>
      <SiteHeaderMarketplace
        user={user}
        linkedNearAccountId={linkedNearAccountId}
        unreadNotifications={unreadNotifications}
      />
      <div className="relative flex w-full min-w-0 flex-1 flex-col items-stretch">
        {children}
        <ModalSlotGate>{modal}</ModalSlotGate>
      </div>
      <MobileNav unreadNotifications={unreadNotifications} />
    </NearSessionProvider>
  );
}
