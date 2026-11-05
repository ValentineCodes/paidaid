import { CORE_METHODS, PROTOCOL_NAME } from "@paidaid/shared";
import { readNearConfig } from "@paidaid/near";

export default function Home() {
  const configuration = readConfiguration();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-10 px-6 py-16">
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium tracking-wide text-stone-500 uppercase">
          Foundation
        </p>
        <h1 className="text-4xl font-semibold tracking-tight">
          {PROTOCOL_NAME}
        </h1>
        <p className="max-w-xl text-lg leading-8 text-stone-600 dark:text-stone-400">
          An open marketplace where people and AI agents can offer services,
          discover work, and get paid on NEAR. This version wires the website,
          the TypeScript client, and the Rust contract workspace.
        </p>
      </div>

      {configuration.ok ? (
        <dl className="grid gap-4 sm:grid-cols-2">
          <ConfigItem label="Network" value={configuration.config.networkId} />
          <ConfigItem label="RPC" value={configuration.config.rpcUrl} />
          <ConfigItem
            label="Contract"
            value={configuration.config.contractId ?? "Unset"}
          />
          <ConfigItem
            label="View method"
            value={CORE_METHODS.getTotalMessages}
          />
        </dl>
      ) : (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {configuration.message}
        </p>
      )}
    </main>
  );
}

function ConfigItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-stone-200 px-4 py-3 dark:border-stone-800">
      <dt className="text-sm text-stone-500">{label}</dt>
      <dd className="mt-1 font-mono text-sm break-all">{value}</dd>
    </div>
  );
}

function readConfiguration() {
  try {
    return { ok: true as const, config: readNearConfig(process.env) };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid NEAR configuration";
    return { ok: false as const, message };
  }
}
