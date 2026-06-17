-- Parser configuration for Google Sheet sources.
-- Run in Supabase SQL Editor after backend schema migration has run.

-- 1. Add parser columns if your DB was created before this feature.
alter table sheets add column if not exists parser_type   text default 'column_villas_month_tabs';
alter table sheets add column if not exists parser_config jsonb default '{}';

-- 2. Current supported n8n parser:
--    column_villas_month_tabs
--
-- Expected sheet shape:
-- - month tabs contain calendar data
-- - dates are in rows
-- - villas/units are in columns
-- - colored cells mean booked
-- - uncolored cells are available candidates
-- - optional "Thông tin" tab contains villa metadata in matching column order

-- 3. Set the existing supported sheets to the rule-based parser.
update sheets
set parser_type = 'column_villas_month_tabs',
    parser_config = coalesce(parser_config, '{}'::jsonb)
where parser_type is null;

-- 4. When adding a sheet with unknown/new format, mark it as needs_manual_mapping
--    so n8n will not parse it incorrectly.
--
-- update sheets
-- set parser_type = 'needs_manual_mapping',
--     parser_config = jsonb_build_object(
--       'reason', 'Format differs from current column-villas-month-tabs parser',
--       'sample_tabs', array['Thông tin', '06.2026']
--     ),
--     sync_status = 'needs_check'
-- where id = 'SHEET_ID_HERE';

-- 5. Audit parser status.
select
  id,
  title,
  url,
  parser_type,
  parser_config,
  sync_status,
  last_error,
  last_synced_at
from sheets
order by parser_type, last_synced_at desc nulls last;
