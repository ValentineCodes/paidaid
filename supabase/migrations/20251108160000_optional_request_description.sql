-- Allow empty task descriptions (title-only briefs).

alter table public.requests drop constraint if exists requests_description_len;

alter table public.requests add constraint requests_description_len check (
  char_length(trim(description)) >= 0
  and char_length(description) <= 1000
);
