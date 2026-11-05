import { ContractFormLoader } from "./contract-form-loader";

export default function ContractPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-16">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium tracking-wide text-stone-500 uppercase">
          PaidAidCore
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Contract interaction
        </h1>
        <p className="text-stone-600 dark:text-stone-400">
          Call{" "}
          <code className="font-mono text-sm">set_message</code>,{" "}
          <code className="font-mono text-sm">get_message</code>, and{" "}
          <code className="font-mono text-sm">get_total_messages</code> on
          localnet.
        </p>
      </div>
      <ContractFormLoader />
    </main>
  );
}
