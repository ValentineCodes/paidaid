import { connection } from "next/server";
import { redirect } from "next/navigation";

import { createClient } from "../../../../lib/supabase/server";
import { isSupabaseConfigured } from "../../../../lib/supabase/env";
import { loadActivityPageData } from "./activity-data";
import { ActivityShell } from "./activity-shell";

export default async function ActivityPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="inner-page">
        <div className="page-heading">
          <span>YOUR WORK</span>
          <h1>Activity</h1>
          <p>Configure Supabase to load your activity.</p>
        </div>
      </main>
    );
  }

  await connection();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?next=/requests/mine");
  }

  const data = await loadActivityPageData(supabase, user.id);

  return <ActivityShell data={data} />;
}
