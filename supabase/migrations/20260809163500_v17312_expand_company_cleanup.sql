-- V17.3.12 Expand company-wide data cleanup.
-- Repairs the repeated West Virginia county import blob across real Expand pads,
-- archives/removes two non-pad workbook placeholders, and preserves all saved
-- driver coordinates, directions, wells, APIs, properties, and road data.

create table if not exists private_verification.expand_pad_cleanup_backup_v17312 as
select p.*, now() as backed_up_at
from public.pads p
with no data;

create unique index if not exists expand_pad_cleanup_backup_v17312_id_idx
  on private_verification.expand_pad_cleanup_backup_v17312(id);

insert into private_verification.expand_pad_cleanup_backup_v17312
select p.*, now()
from public.pads p
where lower(coalesce(p.company,''))='expand'
  and not exists (
    select 1
    from private_verification.expand_pad_cleanup_backup_v17312 b
    where b.id=p.id
  );

create temporary table tmp_expand_county_v17312(
  legacy_id text primary key,
  county text not null,
  evidence_method text not null
) on commit drop;

insert into tmp_expand_county_v17312(legacy_id,county,evidence_method) values
  ('expand--alan-h-degarmo', 'Brooke', 'Saved coordinates mapped to WV county boundary'),
  ('expand--albert-hohman', 'Wetzel', 'Saved coordinates mapped to WV county boundary'),
  ('expand--alice-edge', 'Ohio', 'Saved coordinates mapped to WV county boundary'),
  ('expand--altman', 'Marshall', 'Saved coordinates mapped to WV county boundary'),
  ('expand--alton-stern', 'Marshall', 'Saved coordinates mapped to WV county boundary'),
  ('expand--arthur-waryck', 'Marshall', 'Saved coordinates mapped to WV county boundary'),
  ('expand--b-w-edge', 'Marshall', 'Saved coordinates mapped to WV county boundary'),
  ('expand--ballato-brothers', 'Brooke', 'WVDEP permit / Colliers-Brooke location evidence'),
  ('expand--barry-greathouse-a', 'Brooke', 'Saved coordinates mapped to WV county boundary'),
  ('expand--barry-greathouse-b', 'Brooke', 'Saved coordinates mapped to WV county boundary'),
  ('expand--benjamin-honecker', 'Ohio', 'Saved coordinates mapped to WV county boundary'),
  ('expand--bethlehem-stage', 'Ohio', 'Bethlehem/Wheeling staging location evidence'),
  ('expand--betty-schafer', 'Marshall', 'Saved coordinates mapped to WV county boundary'),
  ('expand--blatt', 'Wetzel', 'Saved coordinates mapped to WV county boundary'),
  ('expand--bonnette', 'Wetzel', 'Saved coordinates mapped to WV county boundary'),
  ('expand--brett-berrisford', 'Wetzel', 'Saved coordinates mapped to WV county boundary'),
  ('expand--brian-dytko', 'Ohio', 'Saved coordinates mapped to WV county boundary'),
  ('expand--brian-teslovich', 'Brooke', 'Saved coordinates mapped to WV county boundary'),
  ('expand--brooke-county-parks', 'Brooke', 'Saved coordinates mapped to WV county boundary'),
  ('expand--bryan-neel', 'Marion', 'Saved coordinates mapped to WV county boundary'),
  ('expand--carl-rotter', 'Ohio', 'Saved coordinates mapped to WV county boundary'),
  ('expand--chad-glauser', 'Ohio', 'Saved coordinates mapped to WV county boundary'),
  ('expand--charles-frye', 'Ohio', 'Saved coordinates mapped to WV county boundary'),
  ('expand--charles-jamison', 'Marshall', 'Saved coordinates mapped to WV county boundary'),
  ('expand--charles-yoho', 'Marshall', 'WVDEP Charles Yoho pad permit evidence'),
  ('expand--chk-a', 'Wetzel', 'Saved coordinates mapped to WV county boundary'),
  ('expand--clarence-farmer', 'Ohio', 'Saved coordinates mapped to WV county boundary'),
  ('expand--columbial-gas-transmission', 'Marshall', 'Saved coordinates mapped to WV county boundary'),
  ('expand--constance-taylor', 'Wetzel', 'Saved coordinates mapped to WV county boundary'),
  ('expand--craig-strope', 'Marshall', 'WVDEP Craig Strope well permit evidence'),
  ('expand--dallas-hall', 'Ohio', 'Saved coordinates mapped to WV county boundary'),
  ('expand--daniel-durig', 'Wetzel', 'Saved coordinates mapped to WV county boundary'),
  ('expand--daniel-morris', 'Marion', 'Saved coordinates mapped to WV county boundary'),
  ('expand--david-durig-lucky-d', 'Wetzel', 'Saved coordinates mapped to WV county boundary'),
  ('expand--david-reinbeau', 'Marshall', 'Saved coordinates mapped to WV county boundary'),
  ('expand--deborah-craig', 'Ohio', 'Saved coordinates mapped to WV county boundary'),
  ('expand--edward-dremak', 'Ohio', 'Saved coordinates mapped to WV county boundary'),
  ('expand--edward-nichols', 'Ohio', 'Saved coordinates mapped to WV county boundary'),
  ('expand--edward-zatta', 'Brooke', 'Saved coordinates mapped to WV county boundary'),
  ('expand--edwin-bunner', 'Marion', 'Saved coordinates mapped to WV county boundary'),
  ('expand--ellsworth-davis', 'Wetzel', 'Saved coordinates mapped to WV county boundary'),
  ('expand--esther-clark', 'Monongalia', 'Saved coordinates mapped to WV county boundary'),
  ('expand--esther-weeks', 'Ohio', 'Saved coordinates mapped to WV county boundary'),
  ('expand--floyd-johnson', 'Wetzel', 'Saved coordinates mapped to WV county boundary'),
  ('expand--fork-ridge', 'Marshall', 'Saved coordinates mapped to WV county boundary'),
  ('expand--franz-thoman', 'Ohio', 'Saved coordinates mapped to WV county boundary'),
  ('expand--gary-kestner', 'Ohio', 'Saved coordinates mapped to WV county boundary'),
  ('expand--geeta', 'Marshall', 'Saved coordinates mapped to WV county boundary'),
  ('expand--george-gantzer', 'Ohio', 'Saved coordinates mapped to WV county boundary'),
  ('expand--gerald-gourley', 'Brooke', 'Saved coordinates mapped to WV county boundary'),
  ('expand--gladys-briggs', 'Marshall', 'Saved coordinates mapped to WV county boundary'),
  ('expand--glenn-didriksen', 'Ohio', 'Saved coordinates mapped to WV county boundary'),
  ('expand--gordon-stansberry', 'Wetzel', 'Saved coordinates mapped to WV county boundary'),
  ('expand--gw-rentals', 'Ohio', 'Saved coordinates mapped to WV county boundary'),
  ('expand--hammers', 'Marshall', 'Saved coordinates mapped to WV county boundary'),
  ('expand--harold-langley', 'Marion', 'Saved coordinates mapped to WV county boundary'),
  ('expand--hohman-hbp-south', 'Wetzel', 'Saved coordinates mapped to WV county boundary'),
  ('expand--howard-shackelford', 'Ohio', 'Saved coordinates mapped to WV county boundary'),
  ('expand--james-messenger', 'Wetzel', 'Saved coordinates mapped to WV county boundary'),
  ('expand--james-seabright', 'Brooke', 'Saved coordinates mapped to WV county boundary'),
  ('expand--john-good-jr', 'Brooke', 'Saved coordinates mapped to WV county boundary'),
  ('expand--john-harwatt', 'Brooke', 'Saved coordinates mapped to WV county boundary'),
  ('expand--john-hupp', 'Brooke', 'Saved coordinates mapped to WV county boundary'),
  ('expand--kathy-mayhew', 'Brooke', 'Saved coordinates mapped to WV county boundary'),
  ('expand--larry-ball', 'Ohio', 'Saved coordinates mapped to WV county boundary'),
  ('expand--linda-greathouse', 'Brooke', 'Saved coordinates mapped to WV county boundary'),
  ('expand--margaret-corbin', 'Brooke', 'Saved coordinates mapped to WV county boundary'),
  ('expand--margaret-sue-kelley', 'Wetzel', 'Saved coordinates mapped to WV county boundary'),
  ('expand--mark-edison', 'Marshall', 'WVDEP Mark Edison pad permit evidence'),
  ('expand--mark-hickman', 'Ohio', 'Saved coordinates mapped to WV county boundary'),
  ('expand--mark-owen', 'Brooke', 'Saved coordinates mapped to WV county boundary'),
  ('expand--martin-r-whiteman-jr', 'Wetzel', 'Saved coordinates mapped to WV county boundary'),
  ('expand--mason-cottrell', 'Ohio', 'Saved coordinates mapped to WV county boundary'),
  ('expand--mason-dixon', 'Marshall', 'Saved coordinates mapped to WV county boundary'),
  ('expand--melvin-kahle', 'Ohio', 'Saved coordinates mapped to WV county boundary'),
  ('expand--michael-dunn', 'Marshall', 'Saved coordinates mapped to WV county boundary'),
  ('expand--michael-ratcliffe', 'Ohio', 'Saved coordinates mapped to WV county boundary'),
  ('expand--michael-ryniawec', 'Brooke', 'Saved coordinates mapped to WV county boundary'),
  ('expand--michael-southworth', 'Marshall', 'Saved coordinates mapped to WV county boundary'),
  ('expand--mildred-mani', 'Brooke', 'Saved coordinates mapped to WV county boundary'),
  ('expand--nick-ballato', 'Brooke', 'Saved coordinates mapped to WV county boundary'),
  ('expand--occ-a', 'Ohio', 'Saved coordinates mapped to WV county boundary'),
  ('expand--oe-burge', 'Marshall', 'Saved coordinates mapped to WV county boundary'),
  ('expand--ov-royalty-trust', 'Brooke', 'Saved coordinates mapped to WV county boundary'),
  ('expand--quality-reclamation', 'Marion', 'Saved coordinates mapped to WV county boundary'),
  ('expand--randy-mcdowell-a', 'Marshall', 'Saved coordinates mapped to WV county boundary'),
  ('expand--randy-mcdowell-b', 'Marshall', 'Saved coordinates mapped to WV county boundary'),
  ('expand--ray-baker', 'Marshall', 'Saved coordinates mapped to WV county boundary'),
  ('expand--rayle-coal-company', 'Ohio', 'Saved coordinates mapped to WV county boundary'),
  ('expand--reliance-minerals', 'Monongalia', 'Saved coordinates mapped to WV county boundary'),
  ('expand--ridgetop-land-ventures', 'Wetzel', 'Saved coordinates mapped to WV county boundary'),
  ('expand--rine', 'Wetzel', 'Saved coordinates mapped to WV county boundary'),
  ('expand--riter', 'Wetzel', 'Saved coordinates mapped to WV county boundary'),
  ('expand--robert-baxter', 'Wetzel', 'Saved coordinates mapped to WV county boundary'),
  ('expand--robert-bone', 'Brooke', 'Saved coordinates mapped to WV county boundary'),
  ('expand--robert-young', 'Marshall', 'Saved coordinates mapped to WV county boundary'),
  ('expand--roth', 'Ohio', 'Saved coordinates mapped to WV county boundary'),
  ('expand--roy-ferrell', 'Ohio', 'Saved coordinates mapped to WV county boundary'),
  ('expand--roy-riggle', 'Ohio', 'Saved coordinates mapped to WV county boundary'),
  ('expand--russell-hervey', 'Brooke', 'Saved coordinates mapped to WV county boundary'),
  ('expand--ruth-keller', 'Marshall', 'Saved coordinates mapped to WV county boundary'),
  ('expand--saber', 'Wetzel', 'Saved coordinates mapped to WV county boundary'),
  ('expand--samuel-hubbard', 'Brooke', 'Saved coordinates mapped to WV county boundary'),
  ('expand--samuel-jones', 'Brooke', 'Saved coordinates mapped to WV county boundary'),
  ('expand--schostag', 'Marshall', 'Saved coordinates mapped to WV county boundary'),
  ('expand--serafin-ortiz', 'Marshall', 'Saved coordinates mapped to WV county boundary'),
  ('expand--shannon-fields', 'Ohio', 'Saved coordinates mapped to WV county boundary'),
  ('expand--shawn-couch', 'Ohio', 'Saved coordinates mapped to WV county boundary'),
  ('expand--shawn-harlan', 'Marshall', 'Saved coordinates mapped to WV county boundary'),
  ('expand--sonia-r', 'Marshall', 'Saved coordinates mapped to WV county boundary'),
  ('expand--state-of-wv-dnr-a', 'Brooke', 'Saved coordinates mapped to WV county boundary'),
  ('expand--state-of-wv-dnr-b', 'Brooke', 'Saved coordinates mapped to WV county boundary'),
  ('expand--state-of-wv-dnr-c', 'Brooke', 'Saved coordinates mapped to WV county boundary'),
  ('expand--swn-a', 'Wetzel', 'Saved coordinates mapped to WV county boundary'),
  ('expand--thelma-hays', 'Ohio', 'Saved coordinates mapped to WV county boundary'),
  ('expand--thomas-parkinson', 'Brooke', 'Saved coordinates mapped to WV county boundary'),
  ('expand--thurman-speece', 'Brooke', 'Saved coordinates mapped to WV county boundary'),
  ('expand--timmy-minch', 'Ohio', 'Saved coordinates mapped to WV county boundary'),
  ('expand--van-aston', 'Marshall', 'Saved coordinates mapped to WV county boundary'),
  ('expand--vernon-johnson', 'Marshall', 'Saved coordinates mapped to WV county boundary'),
  ('expand--villers', 'Marshall', 'Saved coordinates mapped to WV county boundary'),
  ('expand--violet-coss', 'Brooke', 'Saved coordinates mapped to WV county boundary'),
  ('expand--wesbanco-bank', 'Marion', 'Saved coordinates mapped to WV county boundary'),
  ('expand--william-ritchea', 'Wetzel', 'Saved coordinates mapped to WV county boundary'),
  ('expand--william-rodgers', 'Ohio', 'Saved coordinates mapped to WV county boundary'),
  ('expand--worthley', 'Brooke', 'Saved coordinates mapped to WV county boundary'),
  ('expand--yocum', 'Marshall', 'Saved coordinates mapped to WV county boundary');

update public.pads p
set county=m.county,
    extra_data=jsonb_set(
      coalesce(p.extra_data,'{}'::jsonb),
      '{expand_cleanup_20260809}',
      coalesce(p.extra_data->'expand_cleanup_20260809','{}'::jsonb)
        || jsonb_build_object(
          'version','17.3.12',
          'county_repaired',true,
          'county',m.county,
          'county_evidence_method',m.evidence_method,
          'saved_navigation_preserved',true,
          'driver_coordinates_changed',false,
          'directions_changed',false,
          'reviewed_on','2026-08-09'
        ),
      true
    ),
    updated_at=now()
from tmp_expand_county_v17312 m
where p.legacy_id=m.legacy_id
  and lower(coalesce(p.company,''))='expand'
  and lower(coalesce(p.state,'')) in ('west virginia','wv')
  and (
    nullif(btrim(p.county),'') is null
    or length(btrim(p.county))>60
    or p.county like '%-Parks Bryan-Neel%'
    or p.county is distinct from m.county
  );

-- These workbook rows are search-result/import headings, not physical pads.
-- The full original rows remain in the private backup above.
delete from public.pads
where lower(coalesce(company,''))='expand'
  and legacy_id in ('expand--expand-in-west-virginia','expand--west-virginia')
  and latitude is null
  and longitude is null
  and nullif(btrim(coalesce(well_name,'')),'') is null
  and nullif(btrim(coalesce(api,'')),'') is null
  and nullif(btrim(coalesce(structured_road_sequence,'')),'') is null
  and lower(btrim(coalesce(written_directions,'')))='0 results';

-- Re-evaluate evidence flags if the verification helper exists. County repair
-- itself does not claim GPS/directions/well verification.
do $$
begin
  if to_regprocedure('public.refresh_pad_verification_evidence(uuid)') is not null then
    perform public.refresh_pad_verification_evidence(null);
  end if;
end
$$;
