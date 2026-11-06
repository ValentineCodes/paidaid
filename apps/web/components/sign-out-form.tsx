import { signOut } from "../app/auth/actions";

export function SignOutForm() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="rounded-lg border border-stone-300 px-3 py-1.5 font-medium text-stone-800 transition hover:bg-stone-100 dark:border-stone-600 dark:text-stone-100 dark:hover:bg-stone-800"
      >
        Sign out
      </button>
    </form>
  );
}
