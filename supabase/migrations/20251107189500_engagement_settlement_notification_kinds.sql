-- New notification kinds for settlement must commit before use in functions (next migration).

alter type public.notification_kind add value if not exists 'settlement_eligible';
alter type public.notification_kind add value if not exists 'settlement_released';
alter type public.notification_kind add value if not exists 'settlement_auto_eligible';
