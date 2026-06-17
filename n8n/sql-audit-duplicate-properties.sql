-- Audit villa/property duplicates after mixed backend + n8n sync.
-- Run in Supabase SQL Editor.

-- 1. List likely duplicates by normalized visible name.
-- This catches case/spacing duplicates such as:
-- "Vạn Thành Fleur Village" vs "VẠN THÀNH FLEUR VILLAGE".
select
  regexp_replace(lower(trim(name)), '\s+', ' ', 'g') as normalized_name,
  count(*) as duplicate_count,
  array_agg(id order by last_synced_at desc nulls last) as property_ids,
  array_agg(owner_id order by last_synced_at desc nulls last) as owner_ids,
  array_agg(name order by last_synced_at desc nulls last) as names,
  array_agg(source_sheet_id order by last_synced_at desc nulls last) as sheet_ids,
  max(last_synced_at) as last_synced_at
from properties
group by regexp_replace(lower(trim(name)), '\s+', ' ', 'g')
having count(*) > 1
order by duplicate_count desc, normalized_name;

-- 2. List suspicious rows that probably came from old n8n property-id logic.
-- The current backend-compatible ID format is: <sheet_id>_<slug(name)>.
-- Old n8n versions may have IDs using owner_id or tab/column prefixes.
select
  id,
  owner_id,
  name,
  source_sheet_id,
  source_sheet_url,
  description,
  map_url,
  last_synced_at
from properties
where source_sheet_id is not null
  and owner_id is distinct from source_sheet_id
order by source_sheet_id, name;

-- 3. Count availability rows per property to decide which duplicate should survive.
select
  p.id,
  p.owner_id,
  p.name,
  p.source_sheet_id,
  p.description is not null and p.description <> '' as has_description,
  p.map_url is not null and p.map_url <> '' as has_map,
  count(a.*) as availability_rows,
  min(a.date) as min_date,
  max(a.date) as max_date,
  max(a.synced_at) as last_availability_synced
from properties p
left join availability_calendar a on a.property_id = p.id
group by p.id
order by p.name, availability_rows desc;

-- 4. Safe manual merge pattern for one duplicate group.
-- Replace these IDs after reviewing query results.
--
-- begin;
-- insert into availability_calendar(
--   property_id, date, status, price, min_nights, note,
--   source_sheet_id, source_updated_at, synced_at, confidence
-- )
-- select
--   'KEEP_PROPERTY_ID', date, status, price, min_nights, note,
--   source_sheet_id, source_updated_at, synced_at, confidence
-- from availability_calendar
-- where property_id = 'DELETE_PROPERTY_ID'
-- on conflict (property_id, date) do update
-- set status = excluded.status,
--     price = excluded.price,
--     min_nights = excluded.min_nights,
--     note = excluded.note,
--     source_sheet_id = excluded.source_sheet_id,
--     source_updated_at = excluded.source_updated_at,
--     synced_at = excluded.synced_at,
--     confidence = excluded.confidence;
--
-- delete from availability_calendar
-- where property_id = 'DELETE_PROPERTY_ID';
--
-- update review_queue
-- set property_id = 'KEEP_PROPERTY_ID'
-- where property_id = 'DELETE_PROPERTY_ID';
--
-- update booking_requests
-- set property_id = 'KEEP_PROPERTY_ID'
-- where property_id = 'DELETE_PROPERTY_ID';
--
-- delete from properties
-- where id = 'DELETE_PROPERTY_ID';
-- commit;
