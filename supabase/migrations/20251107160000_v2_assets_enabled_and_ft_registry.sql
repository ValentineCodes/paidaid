-- V2: enable/disable flag on trusted asset registry + NEP-141 catalogue (no user-supplied contracts).

alter table public.assets
  add column if not exists enabled boolean not null default true;

create index if not exists assets_chain_enabled
  on public.assets (chain_id, enabled)
  where enabled = true;

comment on column public.assets.enabled is
  'When false, asset is hidden from balance display and must not be used for new budgets.';

update public.assets set enabled = true where enabled is distinct from true;

-- NEP-141 trusted tokens (official/testnet faucets — not user-defined).
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
    'near:testnet',
    'nep141',
    null,
    'wrap.testnet',
    'wNEAR',
    24,
    'near:testnet:nep141:wrap.testnet',
    true
  ),
  (
    'near:testnet',
    'nep141',
    null,
    'usdc.fakes.testnet',
    'USDC',
    6,
    'near:testnet:nep141:usdc.fakes.testnet',
    true
  ),
  (
    'near:mainnet',
    'nep141',
    null,
    'wrap.near',
    'wNEAR',
    24,
    'near:mainnet:nep141:wrap.near',
    true
  ),
  (
    'near:mainnet',
    'nep141',
    null,
    'usdt.tether-token.near',
    'USDT',
    6,
    'near:mainnet:nep141:usdt.tether-token.near',
    true
  )
on conflict (canonical_asset_key) do update
set
  symbol = excluded.symbol,
  decimals = excluded.decimals,
  token_contract_id = excluded.token_contract_id,
  enabled = excluded.enabled;

-- Localnet: native NEAR only (sandbox has no standard FT faucet contract in-repo).
update public.assets
set enabled = true
where chain_id = 'near:localnet' and asset_standard = 'native';
