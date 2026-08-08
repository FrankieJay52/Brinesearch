alter table private_verification.public_data_match_candidates
  add column if not exists review_priority smallint not null default 50
    check(review_priority between 0 and 100),
  add column if not exists driver_usefulness text not null default 'unknown'
    check(driver_usefulness in('high','possible','low','unknown')),
  add column if not exists priority_reason text;

create index if not exists public_data_match_candidates_review_priority_idx
  on private_verification.public_data_match_candidates(
    review_status,review_priority desc,updated_at desc
  );

update private_verification.public_data_match_candidates c
set review_priority=case
      when c.result_category in('API_CONFLICT','LOCATION_CONFLICT') then 100
      when c.result_category='POSSIBLE_DUPLICATE' then 95
      when c.result_category='NEW_WELL_FOR_EXISTING_PAD' then
        case
          when r.official_status in('Producing','Drilling') then 92
          when r.official_status in('Well Drilled','Well Permitted') then 78
          else 45
        end
      when c.result_category='NEW_DISPOSAL_CANDIDATE' then
        case
          when r.official_status='Active Injection' then 100
          when r.official_status in('Drilling','Well Drilled','Well Permitted') then 82
          else 20
        end
      when c.result_category='NEW_PAD_CANDIDATE' then
        case
          when r.official_status='ACTIVE' and exists(
            select 1
            from private_verification.public_data_candidate_well_links l
            where l.pad_source_record_id=r.id
              and l.review_status='confirmed'
          ) then 90
          when r.official_status='ACTIVE' then 75
          when r.official_status in(
            'WELL PAD PERMITTED','NOT BUILT [permit acquired]'
          ) then 55
          else 20
        end
      when c.result_category='STATUS_UPDATE' then 75
      when c.result_category='OPERATOR_CHANGE_OR_ALIAS' then 65
      when c.result_category='OFFICIAL_NAME_ALIAS' then 60
      when c.result_category='NEEDS_OWNER_REVIEW' then
        case
          when r.entity_type='injection'
           and r.official_status='Active Injection' then 95
          else 65
        end
      when c.result_category='VERIFIED_EXISTING_RECORD' then 15
      else 50
    end,
    driver_usefulness=case
      when c.result_category in(
        'API_CONFLICT','LOCATION_CONFLICT','POSSIBLE_DUPLICATE'
      ) then 'high'
      when c.result_category='NEW_WELL_FOR_EXISTING_PAD'
       and r.official_status in(
         'Producing','Drilling','Well Drilled','Well Permitted'
       ) then 'high'
      when c.result_category='NEW_DISPOSAL_CANDIDATE'
       and r.official_status='Active Injection' then 'high'
      when c.result_category='NEW_DISPOSAL_CANDIDATE'
       and r.official_status in(
         'Drilling','Well Drilled','Well Permitted'
       ) then 'possible'
      when c.result_category='NEW_PAD_CANDIDATE'
       and r.official_status='ACTIVE' then 'high'
      when c.result_category='NEW_PAD_CANDIDATE'
       and r.official_status in(
         'WELL PAD PERMITTED','NOT BUILT [permit acquired]'
       ) then 'possible'
      when c.result_category='NEEDS_OWNER_REVIEW'
       and r.entity_type='injection'
       and r.official_status='Active Injection' then 'high'
      when r.official_status in(
        'FINAL RESTORATION','Final Restoration','Plugged and Abandoned',
        'Permit Expired','Cancelled'
      ) then 'low'
      when c.result_category='VERIFIED_EXISTING_RECORD' then 'unknown'
      else 'possible'
    end,
    priority_reason=case
      when c.result_category='API_CONFLICT' then
        'Official API conflicts with the saved BrineSearch attachment.'
      when c.result_category='LOCATION_CONFLICT' then
        'Official source geography conflicts with coordinate-boundary evidence.'
      when c.result_category='POSSIBLE_DUPLICATE' then
        'Multiple BrineSearch records have strong evidence for one official record.'
      when c.result_category='NEW_WELL_FOR_EXISTING_PAD' then
        'Official well is missing from a matched BrineSearch pad.'
      when c.result_category='NEW_DISPOSAL_CANDIDATE'
       and r.official_status='Active Injection' then
        'Active Class II injection well is missing from exact saved disposal APIs.'
      when c.result_category='NEW_DISPOSAL_CANDIDATE' then
        'Official Class II injection record is missing from exact saved disposal APIs; status controls priority.'
      when c.result_category='NEW_PAD_CANDIDATE'
       and r.official_status='ACTIVE' then
        'Active official pad has no reliable BrineSearch match.'
      when c.result_category='NEW_PAD_CANDIDATE' then
        'Official pad has no reliable BrineSearch match; status controls priority.'
      when c.result_category='STATUS_UPDATE' then
        'Current official status differs from saved or historical official data.'
      when c.result_category='OPERATOR_CHANGE_OR_ALIAS' then
        'Current official operator differs from historical official data.'
      when c.result_category='OFFICIAL_NAME_ALIAS' then
        'Current official name differs substantively from historical official data.'
      when c.result_category='NEEDS_OWNER_REVIEW' then
        'Evidence is useful but does not meet automatic confirmation rules.'
      when c.result_category='VERIFIED_EXISTING_RECORD' then
        'Confirmed record retained for audit; no immediate owner action required.'
      else 'Public-data review candidate.'
    end
from private_verification.public_data_source_records r
where r.id=c.source_record_id;
