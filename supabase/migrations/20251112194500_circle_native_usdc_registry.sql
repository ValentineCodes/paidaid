-- Circle-issued native USDC (NEP-141) on NEAR mainnet and testnet.
-- Disables legacy testnet fake USDC (usdc.fakes.testnet). Localnet unchanged (native NEAR only).

insert into public.assets (
  chain_id,
  asset_standard,
  native_reference,
  token_contract_id,
  symbol,
  decimals,
  canonical_asset_key,
  enabled
)
values
  (
    'near:mainnet',
    'nep141',
    null,
    '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
    'USDC',
    6,
    'near:mainnet:nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
    true
  ),
  (
    'near:testnet',
    'nep141',
    null,
    '3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af',
    'USDC',
    6,
    'near:testnet:nep141:3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af',
    true
  )
on conflict (canonical_asset_key) do update
set
  symbol = excluded.symbol,
  decimals = excluded.decimals,
  token_contract_id = excluded.token_contract_id,
  asset_standard = excluded.asset_standard,
  native_reference = excluded.native_reference,
  enabled = excluded.enabled;

update public.assets
set enabled = false
where canonical_asset_key = 'near:testnet:nep141:usdc.fakes.testnet';

comment on table public.assets is
  'NEAR ecosystem asset metadata for indicative budgets and escrow. Circle native USDC uses implicit-account NEP-141 contracts on mainnet/testnet; usdc.fakes.testnet is disabled.';
