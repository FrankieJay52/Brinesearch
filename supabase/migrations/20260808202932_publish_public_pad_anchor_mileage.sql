-- Driver-safe road-reference mileage table for BrineSearch V17.3.5.
-- Internal staging, review notes, unavailable distances and conflicts never
-- enter this public relation. Route edits mark the corresponding reference
-- stale so the browser automatically hides it until it is re-reviewed.

create table public.public_pad_anchor_mileage (
  pad_id uuid primary key references public.pads(id) on delete cascade,
  legacy_id text not null,
  pad_name text not null,
  company text,
  anchor_label text not null,
  distance_miles numeric(10,4),
  distance_text text not null,
  distance_kind text not null,
  target_text text not null,
  reference_point text,
  source_label text not null,
  distance_mode text,
  route_hash text not null,
  is_stale boolean not null default false,
  verified_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.public_pad_anchor_mileage enable row level security;
revoke all on public.public_pad_anchor_mileage from public,anon,authenticated;
grant select on public.public_pad_anchor_mileage to anon,authenticated;
grant all on public.public_pad_anchor_mileage to service_role;

create policy "Public reads current pad anchor mileage"
on public.public_pad_anchor_mileage
for select
to anon,authenticated
using (not is_stale);

create or replace function public.mark_public_pad_anchor_mileage_stale()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $f$
declare
  current_hash text;
begin
  current_hash:=md5(concat_ws(E'\x1f',
    coalesce(new.company,''),
    coalesce(new.state,''),
    coalesce(new.county,''),
    coalesce(new.latitude::text,''),
    coalesce(new.longitude::text,''),
    coalesce(new.structured_road_sequence,''),
    coalesce(new.written_directions,''),
    coalesce(new.directions_clear,'')
  ));

  update public.public_pad_anchor_mileage
  set is_stale=(route_hash is distinct from current_hash),updated_at=now()
  where pad_id=new.id;

  return new;
end
$f$;

revoke all on function public.mark_public_pad_anchor_mileage_stale() from public,anon,authenticated;
grant execute on function public.mark_public_pad_anchor_mileage_stale() to service_role;

drop trigger if exists pads_mark_public_anchor_mileage_stale on public.pads;
create trigger pads_mark_public_anchor_mileage_stale
after update of company,state,county,latitude,longitude,structured_road_sequence,written_directions,directions_clear
on public.pads
for each row execute function public.mark_public_pad_anchor_mileage_stale();

comment on table public.public_pad_anchor_mileage is
  'Driver-safe BrineSearch road-reference mileage. Internal review evidence and unavailable/conflicted candidates are excluded.';
