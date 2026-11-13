-- request_response_milestone_proposals must allow multiple rows per response (one per position).
-- A mistaken UNIQUE on response_id alone blocked the 2nd+ milestone insert.

alter table public.request_response_milestone_proposals
  drop constraint if exists request_response_milestone_proposals_response_id_key;
