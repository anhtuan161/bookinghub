# n8n Sync Handoff

Last updated: 2026-06-17

This document is for the next AI/engineer working on the n8n sync. Read it before editing the workflow. The current canonical import file is:

```text
n8n/n8n.json
```

## Goal

n8n syncs Google Sheet booking data into the central PostgreSQL/Supabase database.

The database is the source of truth. The frontend/backend/chatbot should consume DB/API data, not Google Sheets directly.

## Current Flow

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

## Current Safe Settings

`Load Active Sheets From DB` is intentionally limited:

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

## Supported Parser

Current supported parser:

```text
column_villas_month_tabs
```

Expected format:

```text
Tab tháng chứa lịch
Ngày nằm theo hàng
Villa/căn nằm theo cột
Ô có màu nền = booked
Ô không màu = available candidate
Tab Thông tin nếu có chứa tên căn, mô tả, địa chỉ, map, lưu ý
```

Unsupported sheet formats must not be parsed. Set:

```text
parser_type = needs_manual_mapping
sync_status = needs_check
```

The workflow guards against unsupported parser types and writes `needs_check` instead of creating bad data.

## Critical Duplicate Warning

The system has already seen duplicate properties in the UI.

Symptoms:

```text
UI shows ~65 villas while real count is ~30+
Cards show duplicate names with different casing or missing metadata
Wrong rows like "12 PAX", "8 PAX", "8NL + 2TE" appear as villas
```

Root causes found:

```text
1. Backend and n8n previously used different owner prefixes for property_id.
2. n8n previously picked PAX/NL capacity cells as villa names.
```

Fixes already applied in `n8n/n8n.json`:

```text
effectiveOwnerId = sheetId
property name prioritizes tab Thông tin by column order
PAX/NL are no longer accepted as villa names
```

Important: these fixes prevent new duplicates. They do not delete old duplicate DB rows.

## Cleanup Current Duplicate Data

If the UI is still showing duplicates, run audit first:

```text
n8n/sql-audit-duplicate-properties.sql
```

If the operator wants a full reset and re-sync, run:

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

Then import the latest workflow and run:

```text
limit 1
manual sync
verify SQL
increase gradually
```

## Verification SQL

Property count:

```sql
select count(*) as total_properties
from properties;
```

Duplicate groups:

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

Fake PAX/NL names:

```sql
select id, owner_id, name, source_sheet_id, last_synced_at
from properties
where lower(name) ~ '(^[0-9 -]*(pax|nl|te)|pax$|nl$|te$)'
order by name;
```

Availability summary:

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

Sheet parser status:

```sql
select id, title, parser_type, sync_status, last_error, last_synced_at
from sheets
order by last_synced_at desc nulls last;
```

## Credentials

The workflow uses Google Service Account through the HTTP Request node.

Requirements:

```text
Google Sheets API enabled
Service account credential configured for HTTP Request
Scope: https://www.googleapis.com/auth/spreadsheets.readonly
Owner sheets shared Viewer to service account email
```

If auth errors appear:

```text
Unable to sign without access token
unregistered callers
Forbidden
```

Check the n8n Google Service Account credential first.

## Large Payload Prevention

Do not remove these optimizations:

```text
Read Spreadsheet Metadata first
Build ranged request from selected tabs
Fetch only formattedValue + backgroundColor
Do not fetch effectiveValue
Do not read whole workbook with includeGridData=true
```

If `Normalize Villas And Calendar` runs for minutes, the workflow is probably receiving too much sheet data.

## Planning Rule

Before changing this workflow:

```text
1. Export current workflow from n8n.
2. Save backup as n8n/n8n.backup-<reason>.json.
3. Edit n8n/n8n.json.
4. Validate JSON and Code node syntax.
5. Import into n8n.
6. Run with limit 1.
7. Verify DB with SQL.
```

Never increase the sync limit before duplicate/fake-name checks pass.
