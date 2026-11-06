import { createClient } from "../../lib/supabase/server";
import { SiteHeaderMarketplace } from "../../components/site-header-marketplace";
import { isSupabaseConfigured } from "../../lib/supabase/env";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let user: { email: string; id: string } | null = null;
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
      }
    } catch {
      /* Session read failed — treat as signed out */
    }
  }

  return (
    <>
      <SiteHeaderMarketplace user={user} />
      {children}
    </>
  );
}
