# VillaOS n8n Sync Control

Workflow chinh van la mot flow dung chung:

```text
Schedule / Manual
-> Load Active Sheets From DB
-> Read Google Sheet
-> Normalize by parser_type/parser_config
-> Upsert DB
-> Update sheet sync status
```

## Chay rieng mot hoac nhieu sheet

Mo node `Load Active Sheets From DB`, sua CTE `sync_control`:

```sql
with sync_control as (
  select
    ''::text as only_sheet_ids,
    10::int as batch_size
)
```

Che do mac dinh:

```sql
''::text as only_sheet_ids
```

Nghia la chay batch tu dong cac sheet active.

Chi chay sheet 2:

```sql
's2'::text as only_sheet_ids
```

Chi chay sheet 2 va sheet 3:

```sql
's2,s3'::text as only_sheet_ids
```

## Batch size

`batch_size` quyet dinh moi lan workflow lay toi da bao nhieu sheet:

```sql
10::int as batch_size
```

Khi test parser moi, nen de:

```sql
1::int as batch_size
```

## Bat/tat sheet dai han

Dung DB field:

```sql
update sheets set active = false where id = 's2';
update sheets set active = true where id = 's2';
```

Sheet co `sync_status = 'disabled'` cung se khong duoc chay:

```sql
update sheets set sync_status = 'disabled' where id = 's2';
```

## Parser config theo tung sheet

Moi sheet nen co `parser_type` va `parser_config` rieng:

```sql
update sheets
set parser_type = 'column_villas_month_tabs',
    parser_config = '{
      "empty_uncolored_is_available": true,
      "colored_is_booked": true,
      "review_confidence": 0.8,
      "empty_uncolored_confidence": 0.9,
      "price_available_confidence": 0.9,
      "colored_booked_confidence": 0.94
    }'::jsonb
where id = 's1';
```

Sheet format moi thi them parser/config rieng, khong sua logic dang on cua sheet cu neu chua test.

Y nghia nhanh:

- `review_confidence`: nguong dua vao review queue. Mac dinh `0.8`.
- `empty_uncolored_confidence`: o trong + khong mau. Mac dinh `0.9`.
- `price_available_confidence`: o khong mau co gia. Mac dinh `0.9`.
- `colored_booked_confidence`: o co mau va khong map thanh available. Mac dinh `0.94`.
