-- Verify the Me Bap Homestay sheet after running n8n with limit 1.
-- Expected source:
-- https://docs.google.com/spreadsheets/d/10YNQ_jCFkKkYIBWHmhijVH0u4CDnK2v612OxG5v9A0g
--
-- Baseline rule:
-- - The month tab row "TEN CAN" is the authoritative property list.
-- - "Thong tin can" only enriches address/map/notes when names match.
-- - Expected property count for this sheet is 16.
--
-- This query uses ASCII property_id slugs to avoid Vietnamese encoding issues.

with target_sheet as (
  select id
  from sheets
  where spreadsheet_id = '10YNQ_jCFkKkYIBWHmhijVH0u4CDnK2v612OxG5v9A0g'
  limit 1
),
expected(slug, expected_name) as (
  values
    ('lagom-stay', 'LAGOM.STAY'),
    ('de-celia', 'DE CELIA'),
    ('c-est-la-vie', 'C''EST LA VIE'),
    ('nha-cua-bap-1', 'NHA CUA BAP 1'),
    ('nha-cua-bap-2', 'NHA CUA BAP 2'),
    ('soulmate', 'SOULMATE'),
    ('la-hoa', 'LA HOA'),
    ('le-petit-1', 'LE PETIT 1'),
    ('le-petit-2', 'LE PETIT 2'),
    ('binh-an', 'BINH AN'),
    ('binh-an-2', 'BINH AN 2'),
    ('wendy-s-house', 'WENDY''S HOUSE'),
    ('van-thanh-fleur-village', 'VAN THANH FLEUR VILLAGE'),
    ('blanc-villa', 'BLANC VILLA'),
    ('phong-don-lavender', 'PHONG DON LAVENDER'),
    ('phong-doi-tulip', 'PHONG DOI TULIP')
),
expected_ids as (
  select ts.id || '_' || e.slug as property_id, e.expected_name
  from target_sheet ts
  cross join expected e
),
actual as (
  select p.id, p.name, p.source_sheet_id
  from properties p
  join target_sheet ts on ts.id = p.source_sheet_id
),
dupes as (
  select lower(trim(name)) as name_key,
         count(*) as duplicate_count,
         string_agg(id, ' | ' order by id) as property_ids,
         string_agg(name, ' | ' order by name) as names
  from actual
  group by lower(trim(name))
  having count(*) > 1
)
select 'summary' as check_type,
       null as expected_name,
       null as actual_name,
       null as property_id,
       (select count(*) from actual)::text as detail
union all
select 'missing_id' as check_type,
       e.expected_name,
       null as actual_name,
       e.property_id,
       null as detail
from expected_ids e
left join actual a on a.id = e.property_id
where a.id is null
union all
select 'extra_id' as check_type,
       null as expected_name,
       a.name as actual_name,
       a.id as property_id,
       null as detail
from actual a
left join expected_ids e on e.property_id = a.id
where e.property_id is null
union all
select 'duplicate_name' as check_type,
       null as expected_name,
       d.names as actual_name,
       d.property_ids as property_id,
       d.duplicate_count::text as detail
from dupes d
order by check_type, expected_name, actual_name;

-- Visual final list.
select p.id, p.name, p.source_sheet_id, p.last_synced_at
from properties p
join sheets s on s.id = p.source_sheet_id
where s.spreadsheet_id = '10YNQ_jCFkKkYIBWHmhijVH0u4CDnK2v612OxG5v9A0g'
order by p.id;
