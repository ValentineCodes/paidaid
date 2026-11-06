import { redirect } from "next/navigation";

/** Legacy path — marketplace home is `/`. */
export default function ExploreRedirectPage() {
  redirect("/");
}
