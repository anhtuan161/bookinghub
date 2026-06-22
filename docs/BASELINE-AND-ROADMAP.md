# VillaOS Baseline And Roadmap

Last updated: 2026-06-17

This document is the handoff baseline for future AI agents, engineers, or operators. Read this before changing code, n8n flows, database schema, or sync logic.

## 1. Product Goal

VillaOS is a centralized booking data hub for a villa booking agency in Vietnam.

The agency receives Google Sheets from many villa owners. Each owner can have a different sheet format. Staff currently checks sheets manually when customers ask for available villas. The long-term goal is:

```text
Google Sheets from owners
-> normalized central database
-> internal dashboard/search
-> booking request workflow
-> chatbot consultation based on trusted DB data
```

The central database is the core asset. Google Sheets are sources. n8n/backend sync are ingestion mechanisms. The frontend and future chatbot must read from the database/API, not from Google Sheets directly.

## 2. Core Principles

1. DB is the source of truth.
2. Google Sheets are read-only sources.
3. Any colored booking cell means booked by default.
4. Only uncolored cells are available candidates.
5. Unknown or unsupported formats must go to `needs_check`, not be guessed.
6. Chatbot must never directly confirm final room lock. It can advise and create a booking request.
7. Every phase must start with a plan and end with verification.

## 3. Current Architecture

```text
frontend/
  React + Vite + Tailwind admin web app

backend/
  Express + TypeScript API
  PostgreSQL/Supabase adapter
  optional backend sync service

n8n/
  n8n workflow for Google Sheets -> DB sync

docs/
  solution docs, backend/frontend docs, baseline/roadmap

backend/db/schema.sql
  production PostgreSQL schema
```

Runtime deployment direction:

```text
Frontend: Vercel
Backend: Render
Database: Supabase Postgres
n8n: hosted n8n server
```

## 4. Main Data Model

Important tables:

```text
owners
sheets
properties
availability_calendar
review_queue
booking_requests
sync_logs
profiles
```

The most important tables are:

```text
sheets
properties
availability_calendar
review_queue
```

### sheets

Stores each owner Google Sheet source.

Important fields:

```text
id
owner_id
url
spreadsheet_id
title
parser_type
parser_config
color_mapping
sync_status
last_synced_at
last_error
```

Current supported parser:

```text
column_villas_month_tabs
```

Unsupported/new formats should use:

```text
parser_type = needs_manual_mapping
sync_status = needs_check
```

### properties

Stores normalized villas/units.

Important fields:

```text
id
owner_id
name
area
address
capacity_standard
capacity_max
base_price
extra_fee_note
source_sheet_id
source_sheet_url
description
map_url
last_synced_at
```

### availability_calendar

Stores daily availability.

Important fields:

```text
property_id
date
status: available | booked | blocked | unknown
price
min_nights
note
source_sheet_id
confidence
synced_at
```

### review_queue

Stores rows/cells that the parser cannot safely classify.

Use this when confidence is low or format is not supported.

## 5. Current n8n Baseline

Primary workflow file:

```text
n8n/n8n.json
```

Other related files:

```text
n8n/villaos-google-sheets-sync.json
n8n/VillaOS - Sync Google Sheets to Booking DB.fixed.json
n8n/README.md
n8n/sql-parser-config.sql
n8n/sql-audit-duplicate-properties.sql
```

Current n8n flow:

```text
Manual Sync / Schedule Every 15 Minutes
-> Load Active Sheets From DB
-> Build Google API Request
-> Read Spreadsheet Metadata
-> Build Ranged Google API Request
-> Read Sheet With Cell Colors
-> Normalize Villas And Calendar
-> Pick Property Rows -> Upsert Properties
-> Pick Availability Rows -> Upsert Availability
-> Pick Review Rows -> Upsert Review Queue
-> Pick Sync Summary Rows -> Update Sheet Sync Status
```

Important optimizations already made:

```text
1. limit 1 for safe test runs
2. read metadata first
3. only request selected tab ranges
4. only fetch formattedValue + backgroundColor
5. no $env access in Code node
6. use Google Service Account
7. parser_type guard to avoid parsing unknown formats
```

Current query in `Load Active Sheets From DB` is intentionally limited:

```sql
select id, owner_id, url, spreadsheet_id, title, parser_type, parser_config, color_mapping, last_synced_at
from sheets
where coalesce(sync_status, 'ok') <> 'disabled'
order by last_synced_at asc nulls first
limit 1;
```

Increase only after verification:

```text
limit 1 -> limit 3 -> limit 5 -> limit 10
```

## 6. Google Sheets Rules

Current supported sheet shape:

```text
Month tabs contain calendar data
Dates are in rows
Villas/units are in columns
Month tabs contain a "Ten can" row used as the primary property source
Colored cells mean booked
Uncolored cells are available candidates
Optional "Thong tin" tab contains metadata
```

Expected metadata columns in `Thong tin` tab:

```text
Ten
Thong tin / Mo ta
Dia chi
Dinh vi / Google Maps
Luu y / Ghi chu
```

Important property source rule:

```text
Month tab "Ten can" row is the primary source for property names.
Thong tin tab only enriches metadata when names match.
Do not create properties solely from the Thong tin tab.
```

Current critical rule:

```text
Any background color -> booked by default
No background color -> available candidate
```

Exception:

```text
Text such as bao tri / tam giu / hold -> blocked
Unsupported parser type -> needs_check
Low confidence -> review_queue
```

## 7. Credentials Baseline

### Database

Use Supabase Postgres pooler or Render Postgres.

For Supabase from n8n/Render:

```text
Session pooler is preferred
SSL required
User often looks like postgres.<project-ref>
Host is the pooler host, not the user
```

### Google Service Account

n8n uses Google Service Account for the Google Sheets API.

Required:

```text
Service Account Email / Client Email
Private Key
Scope: https://www.googleapis.com/auth/spreadsheets.readonly
Set up for use in HTTP Request node: ON
```

Owner sheets must be shared with the service account email as Viewer.

If a private key was exposed, rotate it immediately in Google Cloud Console.

## 8. Known Issues And Lessons

### Duplicate properties

Observed issue:

```text
UI showed 65-66 villas while real count should be around 30+
```

Causes found:

```text
1. backend and n8n used different property_id owner prefix
2. n8n parser picked PAX/NL capacity cells as villa names
```

Fixes applied:

```text
n8n now uses sheet.id as effective owner id
n8n now prioritizes Thong tin tab by column order for villa names
n8n no longer uses PAX/NL as property name
```

Existing wrong data in DB is not automatically removed. Use:

```text
n8n/sql-audit-duplicate-properties.sql
```

If starting over, run cleanup SQL:

```sql
begin;
delete from availability_calendar;
delete from review_queue;
delete from booking_requests;
delete from sync_logs;
delete from properties;
update sheets
set sync_status = 'needs_check',
    last_synced_at = null,
    last_error = null;
commit;
```

### Large n8n payload

Observed issue:

```text
Read Sheet input into Normalize reached ~72MB
Normalize ran for >6 minutes
```

Fixes applied:

```text
read metadata first
select only month/current/future tabs + Thong tin
remove effectiveValue from fields
keep only formattedValue + backgroundColor
```

### n8n Code node env access

Observed issue:

```text
access to env vars denied
```

Fix:

```text
Do not use $env inside n8n Code node.
Use constants or DB config.
```

### Google auth

Observed issues:

```text
Unable to sign without access token
unregistered callers
```

Fix:

```text
Use Google Service Account credential configured for HTTP Request node
Sheets must be shared to service account email
Google Sheets API must be enabled
```

## 9. Verification Queries

Run these in Supabase SQL Editor after sync.

### Sync logs

```sql
select *
from sync_logs
order by id desc
limit 20;
```

### Sheet status

```sql
select id, title, parser_type, sync_status, last_synced_at, last_error
from sheets
order by last_synced_at desc nulls last;
```

### Property count

```sql
select count(*) as total_properties
from properties;
```

### Suspected duplicates

```sql
select
  regexp_replace(lower(trim(name)), '\s+', ' ', 'g') as normalized_name,
  count(*) as duplicate_count,
  array_agg(id order by last_synced_at desc nulls last) as property_ids,
  array_agg(name order by last_synced_at desc nulls last) as names
from properties
group by regexp_replace(lower(trim(name)), '\s+', ' ', 'g')
having count(*) > 1
order by duplicate_count desc, normalized_name;
```

### Availability summary

```sql
select p.name,
       count(*) as total_days,
       count(*) filter (where a.status = 'available') as available_days,
       count(*) filter (where a.status = 'booked') as booked_days,
       count(*) filter (where a.status = 'blocked') as blocked_days,
       count(*) filter (where a.status = 'unknown') as unknown_days,
       min(a.date) as from_date,
       max(a.date) as to_date,
       max(a.synced_at) as last_synced
from availability_calendar a
join properties p on p.id = a.property_id
group by p.name
order by last_synced desc;
```

## 10. Backend Baseline

Backend path:

```text
backend/
```

Main files:

```text
backend/src/index.ts
backend/src/routes.ts
backend/src/db.ts
backend/src/store.ts
backend/src/services/sync.ts
backend/db/schema.sql
```

Important API endpoints:

```text
GET  /api/health
GET  /api/properties
GET  /api/properties/:id
GET  /api/properties/:id/availability
POST /api/search/availability
GET  /api/review
POST /api/review/:id/resolve
GET  /api/bookings
POST /api/bookings
PATCH /api/bookings/:id
GET  /api/sheets
POST /api/sheets
PATCH /api/sheets/:id
POST /api/sync/now
GET  /api/dashboard/stats
GET  /api/dashboard/trend
```

Build verification:

```bash
cd backend
npm run build
```

## 11. Frontend Baseline

Frontend path:

```text
frontend/
```

Main screens:

```text
/search
/property/:id
/review
/bookings
/sources
/dashboard
/villas
```

The frontend reads via `frontend/src/lib/api.ts`.

If `VITE_API_URL` is set, it calls the backend.
If not set, it uses mock data.

Build verification:

```bash
cd frontend
npm run build
```

## 12. Always-Planning Workflow For Future AI Agents

Every future change should follow this pattern.

### Step 1. Read Current State

Before editing:

```text
git status --short --branch
read relevant files
inspect current n8n export if changing workflow
inspect schema before changing DB-related code
```

### Step 2. State A Short Plan

Always plan in 3-6 bullets:

```text
what is being changed
why
which files/DB/workflow are affected
how it will be verified
rollback/backup strategy
```

### Step 3. Back Up Risky Artifacts

For n8n:

```text
copy n8n/n8n.json to n8n/n8n.backup-<reason>.json
```

For DB:

```text
write audit query before delete/merge query
use transaction for cleanup
```

### Step 4. Implement Narrowly

Avoid unrelated refactors.

### Step 5. Verify

At minimum:

```text
backend build if backend changed
frontend build if frontend changed
JSON parse + Code-node syntax check if n8n changed
SQL audit if DB changed
```

### Step 6. Explain Outcome

Final response must include:

```text
files changed
what changed
how verified
what operator should do next
known risks
```

## 13. Roadmap

### Phase 0. Stabilize Current Sync

Goal: reliable sync for existing 3 owner sheets.

Tasks:

```text
clean DB duplicate properties
run n8n limit 1
verify properties and availability
increase n8n limit 3, then 5
document each supported format
```

Exit criteria:

```text
property count matches real villa count
no PAX/NL fake villa names
availability rows are created for expected dates
review_queue contains only genuinely uncertain cells
```

### Phase 1. Controlled Onboarding Of New Sheets

Goal: add new owner sheets without corrupting DB.

Tasks:

```text
insert sheet with parser_type = needs_manual_mapping first
inspect sample tabs
assign parser_type = column_villas_month_tabs only if matching
run limit 1
verify SQL queries
only then enable regular schedule
```

Exit criteria:

```text
new owner sheet syncs without duplicates
unsupported formats do not create properties
operator has checklist for new sheets
```

### Phase 2. Parser Registry

Goal: support multiple sheet layouts.

Candidate parser types:

```text
column_villas_month_tabs
row_villas_month_tabs
one_villa_per_tab
linked_child_sheets
ai_extract_needs_review
```

Tasks:

```text
define parser_config schema
add UI/API for parser_type updates
split n8n normalize logic by parser_type
create fixtures for each format
```

Exit criteria:

```text
each parser has a documented expected input shape
each parser has verification SQL
unknown parser types are safely skipped
```

### Phase 3. Backend Direct DB Reads

Goal: frontend sees DB changes immediately without backend restart/cache issues.

Tasks:

```text
replace in-memory read paths with DB queries for properties/availability/review/bookings
keep store only for demo mode
add pagination/filtering for /properties
```

Exit criteria:

```text
n8n sync appears in UI without backend restart
dashboard counts match SQL counts
search results match availability_calendar
```

### Phase 4. Staff Workflow

Goal: make staff operations reliable.

Tasks:

```text
review queue UI improvements
booking request handoff
sync status dashboards
owner/sheet management UI for parser_type
manual cleanup tools for duplicates
```

Exit criteria:

```text
staff can onboard sheet, verify sync, resolve review, create booking request
```

### Phase 5. Chatbot

Goal: customer-facing consultation based on trusted DB data.

Rules:

```text
chatbot calls backend API only
chatbot never reads Google Sheets directly
chatbot never guarantees final booking lock
chatbot creates booking_request for staff handoff
```

Tasks:

```text
availability search tool
property recommendation API
conversation logging
handoff to staff
guardrails for stale data
```

Exit criteria:

```text
chatbot can answer date/guest/budget queries
chatbot can explain rules/notes
chatbot creates booking requests for human confirmation
```

## 14. Immediate Next Actions

1. Run DB cleanup if current data is still duplicated.
2. Import latest `n8n/n8n.json`.
3. Run n8n with `limit 1`.
4. Verify with SQL queries in this document.
5. Increase to `limit 3`, then `limit 5`.
6. Add new sheets only with explicit `parser_type`.
7. Plan Phase 3 backend direct DB reads before scaling heavily.

## 15. Update Log - 2026-06-22

Current working branch:

```text
docs/solution-review-claude
```

Latest relevant commits:

```text
e8623e6 Add n8n zero-row diagnostics
5af51aa Add operator-friendly sheet parser profiles
2361775 Fix n8n parsing for s2 day-only dates
```

### Confirmed Today

```text
s1 sync is working and produces correct data.
s2 initially returned rows_parsed = 0.
The zero-row diagnostic showed:
  parser=column_villas_month_tabs
  selected_tabs=THONG TIN|Thang 6/2026|Thang 7/2026|Thang 8/2026|Thang 9/2026
  tabs_scanned=Thang 6/2026|Thang 7/2026|Thang 8/2026|Thang 9/2026
  tabs_with_date_rows=none
Root cause: s2 was using the wrong parser type.
Fix: set s2 parser_type to weekday_day_columns_month_tabs.
Result: s2 data started appearing after the parser_type was corrected.
```

### Important Operational Rule

Do not modify parser logic for s1 when onboarding s2/s3/s4.

Each sheet must be assigned the correct sheet profile:

```text
Mau A - ngay 01/07
  parser_type = column_villas_month_tabs
  Use for sheets like s1.

Mau B - cot Thu/Ngay
  parser_type = weekday_day_columns_month_tabs
  Use for sheets like s2, where the tab title contains month/year and the date column contains day numbers 1..31.

Chua biet - can setup
  parser_type = needs_manual_mapping
  Use for sheets that do not clearly match A or B.
```

The preferred way to update parser type is the UI `Nguon du lieu` -> column `Mau sheet`.
Direct SQL should only be used as a temporary repair path.

Temporary SQL repair example:

```sql
update sheets
set parser_type = 'weekday_day_columns_month_tabs',
    parser_config = coalesce(parser_config, '{}'::jsonb)
where id = 's2';
```

### n8n Diagnostic Added

The `Normalize Villas And Calendar` node now writes a useful `error_sql` when `rows_parsed = 0`.

Example:

```text
no_rows_parsed;
parser=column_villas_month_tabs;
selected_tabs=...;
tabs_scanned=...;
tabs_with_date_rows=none;
tabs_without_date_rows=...
```

How to interpret:

```text
parser=wrong value
  The sheet is using the wrong profile.

selected_tabs=none
  Build Ranged Google API Request did not detect month tabs.

tabs_scanned has tabs but tabs_with_date_rows=none
  The parser could not identify date rows in the selected tabs.

tabs_with_date_rows has tabs but rows_parsed=0
  The parser found dates but did not identify property/villa columns.
```

### Procedure For s3/s4/s5 And The Next 10 Sheets

Use a one-sheet-at-a-time onboarding loop:

```text
1. Add or verify the sheet exists in DB/UI.
2. Choose Mau sheet in UI.
3. In n8n Load Active Sheets From DB, set only_sheet_ids to the target sheet id, for example 's3'.
4. Run manual n8n.
5. Check Normalize output:
   - rows_parsed > 0
   - rows_review is reasonable
   - error_sql is empty or understandable
6. Check DB counts by source_sheet_id.
7. Verify sample dates against the Google Sheet screenshot.
8. Only then move to the next sheet.
```

Do not run all 10 new sheets in one batch until each sheet has passed the one-sheet test.

### Current Priority

Next engineering priority remains:

```text
R1 - Backend/UI stale data risk.
```

n8n writes directly to Postgres, while parts of the backend still serve hydrated in-memory state.
Before scaling to many sheets or chatbot usage, either:

```text
1. make read endpoints query Postgres directly for live availability/search data, or
2. make n8n call POST /data/reload after sync, or
3. add a short backend auto-refresh interval.
```

Preferred direction: make availability/search read from Postgres directly in production.
