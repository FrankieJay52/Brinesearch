-- BrineSearch V17.3.19
-- Infinity Rubel has a short but usable saved route. Keep only explicit road/exit
-- actions and the lease-road side; do not promote the ambiguous saved landmark
-- phrase "Clearwater five" into driver directions.

insert into private_verification.direction_gap_repair_backup_v17319(
  pad_id,legacy_id,structured_road_sequence,written_directions,directions_clear,road_sequence_status
)
select id,legacy_id,structured_road_sequence,written_directions,directions_clear,road_sequence_status
from public.pads
where legacy_id='infinity--rubel'
on conflict(pad_id) do nothing;

update public.pads
set structured_road_sequence='I-70 → Old Washington/Senecaville Exit → OH-331 → Lease Road',
    directions_clear=$clear$Road sequence reference:
I-70 → Old Washington/Senecaville Exit → OH-331 → Lease Road

Step-by-step directions:
1. Take the Old Washington/Senecaville exit from I-70.
2. Turn right on OH-331.
3. Take the lease road on the left before the Dollar Store.$clear$,
    directions_clear_method='V17.3.19 source-grounded cleanup from saved written directions',
    directions_clear_updated_at=now(),
    road_sequence_status='Source-grounded from existing saved written directions',
    road_sequence_reviewed_date=current_date,
    updated_at=now(),
    extra_data=coalesce(extra_data,'{}'::jsonb)||jsonb_build_object(
      'direction_gap_repair_v17319',jsonb_build_object(
        'status','published_source_grounded',
        'source','existing written_directions',
        'excluded_ambiguous_landmark_text','Go past Clearwater five',
        'gps_changed',false,
        'reviewed_on',current_date
      )
    )
where legacy_id='infinity--rubel'
  and nullif(btrim(coalesce(directions_clear,'')),'') is null
  and written_directions ilike '%Old Washington/Senecaville%'
  and written_directions ilike '%331%'
  and written_directions ilike '%Lease Road is on the left%';
