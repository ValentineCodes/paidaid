import { signOut } from "../app/auth/actions";

export function SignOutForm() {
  return (
    <form action={signOut}>
      <button type="submit" className="secondary !h-10 !px-4 text-xs">
        Sign out
      </button>
    </form>
  );
}
