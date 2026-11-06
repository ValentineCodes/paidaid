# PaidAid V1 — data model (preparation)

**Scope:** Logical model and Postgres-oriented design for **Active** rebuilt for the **NEAR ecosystem** (PaidAid). **No migrations in repo today** — this is the target shape when Supabase is added.

**Cross-references:** `v1-architecture.md` (flows), `v1-implementation-plan.md` (phasing).

**Identity (final):** **Only** Supabase **`auth.users.id`**. **`profiles.id` = `auth.users.id`**. **No** phone, **no** magic-link primary, **no** OAuth, **no** wallet tables, **no** NEAR AccountId in user rows or RLS.

---

## Final state enums (must match architecture + plan)

| Entity         | Values                                              |
| -------------- | --------------------------------------------------- |
| **Request**    | `draft`, `open`, `assigned`, `completed`, `expired` |
| **Response**   | `pending`, `withdrawn`, `accepted`, `rejected`      |
| **Engagement** | `active`, `completed`                               |
| **Delivery**   | `pending_review`, `revision_requested`, `approved`  |

**Rules:** A response may be **accepted** only if `requests.status = open`. No **`cancelled`** request/engagement in V1 — use **issue reporting**.

---

## Terminology (product → tables)

| Concept                       | Table(s)                                       |
| ----------------------------- | ---------------------------------------------- |
| User                          | `auth.users` + `profiles`                      |
| Provider profile (lazy)       | `provider_profiles`                            |
| Request                       | `requests` + `request_tags` + `request_photos` |
| Tag catalogue                 | `tags`                                         |
| Response                      | `request_responses`                            |
| Assignment                    | `assignments`                                  |
| Engagement                    | `engagements`                                  |
| Conversation (lobby + formal) | `conversations`                                |
| Message                       | `messages` + `message_attachments`             |
| Delivery                      | `deliveries` + `delivery_attachments`          |
| Issue report                  | `engagement_issues`                            |
| Notification                  | `notifications`                                |
| Review                        | `reviews`                                      |

---

## 1. `profiles`

| Column                           | Type          | Notes                                                                              |
| -------------------------------- | ------------- | ---------------------------------------------------------------------------------- |
| `id`                             | `uuid` PK     | **`auth.users.id`**                                                                |
| `display_name`                   | `text`        | Required when? — **TBD** min rules; not stricter than Active unless specified      |
| `avatar_url`                     | `text`        | Nullable; **gallery** uploads (if any) **do not** satisfy the **live camera gate** |
| `live_profile_photo_path`        | `text`        | Nullable; Storage path; **only** set by in-app **camera capture** pipeline         |
| `live_profile_photo_captured_at` | `timestamptz` | Nullable; set when live photo stored                                               |
| `bio`                            | `text`        | Nullable                                                                           |
| `created_at` / `updated_at`      | `timestamptz` |                                                                                    |

**Gate:** `submit_response` and `send_message` paths require **`live_profile_photo_path IS NOT NULL`** (and optionally **`live_profile_photo_captured_at`**). Enforce in **`SECURITY DEFINER` RPCs** that insert messages/responses; optionally **`CHECK` via triggers** — **not** UI-only.

**RLS:** Users manage own row. **Public read** of safe columns can use a **`profiles_public` view** excluding sensitive fields.

---

## 2. `provider_profiles` (lazy)

Created on **first response** (same transaction as first `request_responses` insert).

| Column                      | Type          | Notes                                                                             |
| --------------------------- | ------------- | --------------------------------------------------------------------------------- |
| `id`                        | `uuid` PK     |                                                                                   |
| `user_id`                   | `uuid` UNIQUE | → `profiles.id`                                                                   |
| `headline`                  | `text`        | Optional                                                                          |
| `kind`                      | `enum`        | `human` only in V1 product surface; **`ai` reserved** — **no AI execution in V1** |
| `metadata`                  | `jsonb`       | Nullable                                                                          |
| `created_at` / `updated_at` | `timestamptz` |                                                                                   |

---

## 3. `assets` — NEAR-ecosystem metadata (indicative budgets)

| Column                | Type          | Notes                |
| --------------------- | ------------- | -------------------- |
| `id`                  | `uuid` PK     |                      |
| `chain_id`            | `text`        | e.g. `near:mainnet`  |
| `asset_standard`      | `enum`        | `native` \| `nep141` |
| `native_reference`    | `text`        | Required if native   |
| `token_contract_id`   | `text`        | Required if nep141   |
| `symbol`              | `text`        |                      |
| `decimals`            | `smallint`    | Display only         |
| `canonical_asset_key` | `text` UNIQUE | Dedup key            |

**Check constraints** as before (native vs nep141 mutual exclusion).

### 3.1 `app_config` (singleton)

| `allow_cross_asset_responses` | `boolean` default **false** |

---

## 4. `tags` / `request_tags`

**Predefined tags only**; **max 3** per request (trigger). **Tags optional.** No custom tags, no inference.

---

## 5. `requests`

| Column                      | Type             | Notes                                                                                       |
| --------------------------- | ---------------- | ------------------------------------------------------------------------------------------- |
| `id`                        | `uuid` PK        |                                                                                             |
| `requester_id`              | `uuid`           | → `profiles.id`                                                                             |
| `title`                     | `text`           | **CHECK char_length ≥ 3 AND ≤ 50**                                                          |
| `description`               | `text`           | **CHECK char_length ≥ 1 AND ≤ 1000**                                                        |
| `status`                    | `request_status` | `draft` \| `open` \| `assigned` \| `completed` \| `expired`                                 |
| `timing_type`               | `enum`           | `immediate` \| `scheduled`                                                                  |
| `scheduled_at`              | `timestamptz`    | **NOT NULL** iff `scheduled`; **NULL** iff `immediate`                                      |
| `deadline_at`               | `timestamptz`    | Optional completion expectation                                                             |
| `expires_at`                | `timestamptz`    | Optional — **open + unassigned** listing passes this → **`expired`** (see §5.1)             |
| `budget_amount`             | `numeric(78,0)`  | **> 0**                                                                                     |
| `budget_asset_id`           | `uuid`           | → `assets`                                                                                  |
| `location_label`            | `text`           | Optional                                                                                    |
| `location_kind`             | `enum`           | `unspecified` \| `online` \| `in_person` — **implementation may simplify** — see unresolved |
| `location_structured`       | `jsonb`          | Optional                                                                                    |
| `published_at`              | `timestamptz`    |                                                                                             |
| `first_response_at`         | `timestamptz`    | **NULL** until first `request_responses` insert; **edit lock**                              |
| `created_at` / `updated_at` | `timestamptz`    |                                                                                             |

**CHECK:** `(timing_type = scheduled AND scheduled_at IS NOT NULL) OR (timing_type = immediate AND scheduled_at IS NULL)`.

### 5.1 Expiration (vs completion)

- **`expired`:** Request was **`open`**, **never assigned**, and **`expires_at` IS NOT NULL AND `expires_at` < now()** (or equivalent product rule). Background **job** sets `status = expired`.
- **`completed`:** Request reached successful end through engagement (normal or 72h auto). Distinct from **`expired`**.

**Unresolved (product):** Whether **`deadline_alone`** without **`expires_at`** should drive open-request expiry — document when decided.

---

## 6. `request_photos`

**Max 5** per request (trigger). **CHECK** count ≤ 5.

---

## 7. `request_responses`

| Column                      | Type              | Notes                                                                      |
| --------------------------- | ----------------- | -------------------------------------------------------------------------- |
| `id`                        | `uuid` PK         |                                                                            |
| `request_id`                | `uuid`            |                                                                            |
| `provider_profile_id`       | `uuid`            |                                                                            |
| `message`                   | `text`            |                                                                            |
| `proposed_amount`           | `numeric(78,0)`   | **> 0**                                                                    |
| `proposed_asset_id`         | `uuid`            | Must match request budget asset if **`allow_cross_asset_responses`** false |
| `status`                    | `response_status` | `pending` \| `withdrawn` \| `accepted` \| `rejected`                       |
| `created_at` / `updated_at` | `timestamptz`     |                                                                            |

**Constraints:**

- **Partial unique:** one **`accepted`** per `request_id`.
- **No self-response:** enforce in RPC: `provider_profile.user_id <> requests.requester_id`.
- **Duplicate provider:** **UNIQUE (`request_id`, `provider_profile_id`) WHERE `status` = `pending'`** — provider may submit again only after **`withdrawn`** (or product allows one row ever — **prefer** pending-only unique for Active-like re-offer).
- **Trigger:** on first insert for `request_id`, set **`requests.first_response_at = now()`** if null (locks edits forever for that request).

**RLS:** Requester reads responses on own requests; provider reads own; **public** listing does **not** expose response bodies — see §15.

---

## 8. `assignments`

| Column                 | Type          | Notes |
| ---------------------- | ------------- | ----- |
| `id`                   | `uuid` PK     |       |
| `request_id`           | `uuid` UNIQUE |       |
| `accepted_response_id` | `uuid` UNIQUE |       |
| `requester_id`         | `uuid`        |       |
| `provider_user_id`     | `uuid`        |       |
| `created_at`           | `timestamptz` |       |

---

## 9. `engagements`

| Column                      | Type                | Notes                                                                                           |
| --------------------------- | ------------------- | ----------------------------------------------------------------------------------------------- |
| `id`                        | `uuid` PK           |                                                                                                 |
| `assignment_id`             | `uuid` UNIQUE       |                                                                                                 |
| `status`                    | `engagement_status` | **`active`** \| **`completed`**                                                                 |
| `scheduled_for_day`         | `date`              | **Calendar date** for same-date rule; set in **`accept_response`**                              |
| `completed_at`              | `timestamptz`       |                                                                                                 |
| `auto_completed_at`         | `timestamptz`       | If closed by 72h job                                                                            |
| `auto_complete_deadline_at` | `timestamptz`       | When 72h auto-complete **would** fire (**set** when delivery enters `pending_review` — see §12) |
| `created_at` / `updated_at` | `timestamptz`       |                                                                                                 |

---

## 10. `conversations` (pre-acceptance lobby + formal)

| Column          | Type      | Notes                                                                                              |
| --------------- | --------- | -------------------------------------------------------------------------------------------------- |
| `id`            | `uuid` PK |                                                                                                    |
| `request_id`    | `uuid`    | **NOT NULL**                                                                                       |
| `kind`          | `enum`    | **`pre_accept`** \| **`engagement`**                                                               |
| `response_id`   | `uuid`    | **FK → `request_responses`**; **required** if `kind = pre_accept` (which offer the lobby is about) |
| `engagement_id` | `uuid`    | **required** if `kind = engagement`; **NULL** for pre_accept                                       |

**Uniqueness:**

- **`engagement`:** **UNIQUE (`engagement_id`)** where not null.
- **`pre_accept`:** **UNIQUE (`request_id`, `response_id`)** where `kind = pre_accept`**.

**Rules:** Creating **`pre_accept`** does **not** create assignment/engagement. **`accept_response`** creates the **`engagement`** conversation (and rows listed in RPC §14).

---

## 11. `messages` / `message_attachments`

| Column                     | Type   | Notes                                                                              |
| -------------------------- | ------ | ---------------------------------------------------------------------------------- |
| `messages.conversation_id` | `uuid` | → `conversations`                                                                  |
| `messages.sender_id`       | `uuid` | Must be requester or responding provider for that thread (enforced in RPC/trigger) |

**Profile gate** on insert (must have live profile photo).

**RLS:** Participants only (requester + provider party for that thread).

---

## 12. `deliveries` / `delivery_attachments`

| Column                     | Type              | Notes                                            |
| -------------------------- | ----------------- | ------------------------------------------------ |
| `deliveries.engagement_id` | `uuid`            |                                                  |
| `deliveries.status`        | `delivery_status` |                                                  |
| `deliveries.submitted_at`  | `timestamptz`     | Set when entering `pending_review` from provider |

**72-hour clock:** On transition to **`pending_review`** (or republish after revision), set/update **`engagements.auto_complete_deadline_at = submitted_at + interval '72 hours'`** (and clear or reset flags). Auto-complete **job** compares `now()` to this.

**Revision:** Moving to **`revision_requested`** may **clear** `auto_complete_deadline_at` until a new submission — **exact rule TBD** (unresolved).

---

## 13. `engagement_issues` (minimal — blocks auto-complete)

| Column                       | Type          | Notes                                                             |
| ---------------------------- | ------------- | ----------------------------------------------------------------- |
| `id`                         | `uuid` PK     |                                                                   |
| `engagement_id`              | `uuid`        |                                                                   |
| `reporter_id`                | `uuid`        |                                                                   |
| `category`                   | `text`        | e.g. `no_show`, `work_not_done`, `delivery_disagreement`, `other` |
| `body`                       | `text`        |                                                                   |
| `status`                     | `enum`        | **`open`** \| **`resolved`**                                      |
| `created_at` / `resolved_at` | `timestamptz` |                                                                   |

**Rule:** While **≥ 1** `open` issue exists on the engagement, **suspend** automatic 72h completion.

**RLS:** Participants can insert/select own engagement’s issues; **no** public read.

---

## 14. `reviews`

| `engagement_id` | FK | |
| `rating` | `smallint` | 1–5 |
| `comment` | `text` | Optional |

After engagement **`completed`**.

---

## 15. `notifications`

In-app first; insert from RPCs/jobs.

---

## 16. Public browse — data exposed

**Anonymous `SELECT`** allowed on:

- **`requests`** where `status = open`: **only** safe columns (title, description excerpt, tags, timing, public budget display, location label **if safe**, **no** requester email/phone).
- **No** `request_responses`, **no** `messages`, **no** PII from profiles without auth.

Implement via **view** `requests_public` + RLS on base table, or column-level policies.

---

## 17. Background jobs (server-side only)

| Job                             | Role                                                                                                                                                                               |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`expire_open_requests`**      | `UPDATE requests SET status = expired` where `status = open` AND **unassigned** AND `expires_at < now()`                                                                           |
| **`auto_complete_engagements`** | For `active` engagements with `auto_complete_deadline_at <= now()` AND delivery **`pending_review`** AND **no open issues** → set engagement + request **`completed`**, idempotent |
| **(optional) clear deadlines**  | When issue opened, pause; when resolved, recalc if needed                                                                                                                          |

**No client timers** for enforcement.

---

## 18. RPC: `accept_response` (full specification)

**Signature:** `accept_response(p_request_id uuid, p_response_id uuid) RETURNS void` (or json)

**Security:**

- `SECURITY DEFINER`; owner = migration role (e.g. `postgres`).
- **`SET search_path = public`** (or explicit trusted list only).
- **`REVOKE ALL ON FUNCTION ... FROM PUBLIC;`**
- **`REVOKE ALL ... FROM anon;`** (if exists)
- **`GRANT EXECUTE ON FUNCTION ... TO authenticated;`**
- **`DO NOT`** grant execute to **`anon`**.

**Steps (single transaction):**

1. **`auth.uid()` IS NOT NULL** — else raise.
2. **`SELECT * FROM requests WHERE id = p_request_id FOR UPDATE`**. If not found → raise.
3. Verify **`requester_id = auth.uid()`**.
4. Verify **`status = open`**.
5. Load response **`FOR UPDATE`** (optional lock): id **`p_response_id`**, **`request_id`**, **`status = pending`**.
6. Verify **`request_responses.provider_profile_id`** belongs to **`provider_profiles.user_id <> request.requester_id`** (no self-response).
7. **Same-date check:** `NOT EXISTS (SELECT 1 FROM engagements e JOIN assignments a ON ... WHERE e.provider_user_id = :provider AND e.status = 'active' AND e.scheduled_for_day = :new_day)` — compute **`scheduled_for_day`** per architecture; **serialize** with provider-level lock if needed (**implementation detail** — see unresolved).
8. **`UPDATE request_responses SET status = accepted`** where id = **`p_response_id`**.
9. **`UPDATE request_responses SET status = rejected`** where `request_id = p_request_id` AND `status = pending` AND `id <> p_response_id`.
10. **`INSERT assignments (...)`**.
11. **`INSERT engagements (..., status active, scheduled_for_day ...)`**.
12. **`INSERT conversations (kind = engagement, engagement_id = ...)`**.
13. **`UPDATE requests SET status = assigned`**, etc.
14. **`INSERT notifications`**.
15. **Commit**.

**Idempotency:** If request **already `assigned`** with **`accepted_response_id = p_response_id`**, return **success no-op** (or raise **stable** “already accepted” — pick one and test).

---

## 19. Request update RPC (`update_request`)

Enforces: `draft | open`, not expired, **`first_response_at IS NULL`**, field constraints (title length, etc.). Reject otherwise.

---

## 20. Indexes (important)

- `requests(status, published_at)` — explore
- `requests(expires_at) WHERE status = open` — expiry job
- `request_responses(request_id, status)`
- `engagements(provider_user_id, scheduled_for_day) WHERE status = active` — same-date check
- `engagements(auto_complete_deadline_at) WHERE status = active` — auto-complete job
- `engagement_issues(engagement_id) WHERE status = open` — blocker check

---

## 21. Money (TypeScript)

**bigint** / decimal **string**; **never** `Number` for base units.

---

## 22. Unresolved — needs explicit product/engineering approval

1. **Timezone** for **`scheduled_for_day`** on **immediate** requests (single org timezone vs per-user profile).
2. **Concurrent `accept_response`:** strongest pattern (provider row `FOR UPDATE` vs advisory lock) — choose at implementation.
3. **Revision + 72h:** whether clock **restarts** on each `pending_review` submission.
4. **`expires_at` vs `deadline_at`:** whether one drives listing expiry when only the other is set.
5. **`location_kind`** simplification if three values are too heavy for MVP.
6. **Duplicate response:** confirm **unique pending per provider** vs **one row per provider forever**.

---

This model aligns with **email-only auth**, **Active** composition/edit/issue/auto-complete rules, **pre-accept lobby + formal conversations**, **atomic accept_response**, **public browse**, and **no** wallet or payment settlement in V1.
