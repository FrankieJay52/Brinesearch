-- BrineSearch V17.3.19
-- Esther Weeks is one of the live pads missing Clear Directions but its saved
-- written directions contain a complete usable road sequence. Publish only what
-- the saved source says, normalize the structured sequence, and preserve all GPS.

create table if not exists private_verification.direction_gap_repair_backup_v17319 (
  pad_id uuid primary key,
  legacy_id text,
  structured_road_sequence text,
  written_directions text,
  directions_clear text,
  road_sequence_status text,
  backed_up_at timestamptz not null default now()
);

insert into private_verification.direction_gap_repair_backup_v17319(
  pad_id,legacy_id,structured_road_sequence,written_directions,directions_clear,road_sequence_status
)
select id,legacy_id,structured_road_sequence,written_directions,directions_clear,road_sequence_status
from public.pads
where legacy_id='expand--esther-weeks'
on conflict(pad_id) do nothing;

update public.pads
set structured_road_sequence='I-70 → Exit 5 → US-40 → Kruger St → Lounez Ave → CR-23 / Stone Church Rd → Oklahoma Rd → Pad',
    directions_clear=$clear$Road sequence reference:
I-70 → Exit 5 → US-40 → Kruger St → Lounez Ave → CR-23 / Stone Church Rd → Oklahoma Rd → Pad

Step-by-step directions:
1. Take Exit 5 to US-40.
2. Turn left on Kruger St.
3. Turn left on Lounez Ave.
4. Veer right on CR-23 / Stone Church Rd. Continue approximately 6 miles.
5. Turn left on Oklahoma Rd. The saved directions describe Oklahoma Rd as gravel/dirt and single lane; the pad is on the left.$clear$,
    directions_clear_method='V17.3.19 source-grounded cleanup from saved written directions',
    directions_clear_updated_at=now(),
    road_sequence_status='Source-grounded from existing saved written directions',
    road_sequence_reviewed_date=current_date,
    updated_at=now(),
    extra_data=coalesce(extra_data,'{}'::jsonb)||jsonb_build_object(
      'direction_gap_repair_v17319',jsonb_build_object(
        'status','published_source_grounded',
        'source','existing written_directions + structured_road_sequence',
        'gps_changed',false,
        'reviewed_on',current_date
      )
    )
where legacy_id='expand--esther-weeks'
  and nullif(btrim(coalesce(directions_clear,'')),'') is null
  and written_directions ilike '%Kruger St%'
  and written_directions ilike '%stone church%'
  and written_directions ilike '%Oklahoma%'
  and written_directions ilike '%roughly 6 miles%';

-- Record the Durr source conflict without publishing it. The current saved text
-- ends at the Sidwell Well Pad, so it is not safe to use as Durr directions.
update public.pads
set extra_data=coalesce(extra_data,'{}'::jsonb)||jsonb_build_object(
  'direction_gap_repair_v17319',jsonb_build_object(
    'status','held_source_pad_name_mismatch',
    'reason','Saved written directions end at Sidwell Well Pad while this record is Durr; no directions published',
    'gps_changed',false,
    'reviewed_on',current_date
  )
)
where legacy_id='ascent--durr'
  and nullif(btrim(coalesce(directions_clear,'')),'') is null
  and written_directions ilike '%Sidwell Well%';

-- Refresh direction intelligence so Esther becomes available through the same
-- road/mileage pipeline as the rest of the directory.
select public.brinesearch_refresh_all_direction_intelligence();
