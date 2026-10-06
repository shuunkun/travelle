-- Travellé cloud schema. Paste into Supabase → SQL Editor → Run. Safe to re-run.
--
-- Trips are stored as a JSON document (itinerary, checklist, travelers and the
-- `people` on the trip). Expenses and settlements get their own rows so two
-- people adding expenses at the same time never overwrite each other.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.trips (
  id text primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- The traveler on this trip that represents the owner.
  owner_person_id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.trip_members (
  trip_id text not null references public.trips (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Which traveler on the trip this account is.
  person_id text not null,
  joined_at timestamptz not null default now(),
  primary key (trip_id, user_id),
  unique (trip_id, person_id)
);

create table if not exists public.expenses (
  id text primary key,
  trip_id text not null references public.trips (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists expenses_trip_id_idx on public.expenses (trip_id);

create table if not exists public.settlements (
  id text primary key,
  trip_id text not null references public.trips (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists settlements_trip_id_idx on public.settlements (trip_id);

create table if not exists public.trip_invites (
  code text primary key default translate(encode(gen_random_bytes(9), 'base64'), '+/', '-_'),
  trip_id text not null references public.trips (id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Per-account data: the friends list (including your own profile).
create table if not exists public.user_data (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  friends jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helpers and triggers
-- ---------------------------------------------------------------------------

create or replace function public.is_trip_member(p_trip_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from trip_members where trip_id = p_trip_id and user_id = auth.uid()
  );
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.protect_trip_owner()
returns trigger
language plpgsql
as $$
begin
  new.owner_id := old.owner_id;
  new.owner_person_id := old.owner_person_id;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.add_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into trip_members (trip_id, user_id, person_id)
  values (new.id, new.owner_id, new.owner_person_id)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists trips_owner_member on public.trips;
create trigger trips_owner_member after insert on public.trips
  for each row execute function public.add_owner_membership();

drop trigger if exists trips_protect_owner on public.trips;
create trigger trips_protect_owner before update on public.trips
  for each row execute function public.protect_trip_owner();

drop trigger if exists expenses_touch on public.expenses;
create trigger expenses_touch before update on public.expenses
  for each row execute function public.touch_updated_at();

drop trigger if exists settlements_touch on public.settlements;
create trigger settlements_touch before update on public.settlements
  for each row execute function public.touch_updated_at();

drop trigger if exists user_data_touch on public.user_data;
create trigger user_data_touch before update on public.user_data
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.expenses enable row level security;
alter table public.settlements enable row level security;
alter table public.trip_invites enable row level security;
alter table public.user_data enable row level security;

drop policy if exists trips_select on public.trips;
create policy trips_select on public.trips for select to authenticated
  using (owner_id = auth.uid() or public.is_trip_member(id));
drop policy if exists trips_insert on public.trips;
create policy trips_insert on public.trips for insert to authenticated
  with check (owner_id = auth.uid());
drop policy if exists trips_update on public.trips;
create policy trips_update on public.trips for update to authenticated
  using (public.is_trip_member(id)) with check (public.is_trip_member(id));
drop policy if exists trips_delete on public.trips;
create policy trips_delete on public.trips for delete to authenticated
  using (owner_id = auth.uid());

drop policy if exists members_select on public.trip_members;
create policy members_select on public.trip_members for select to authenticated
  using (public.is_trip_member(trip_id));
-- Leaving a trip. Joining goes through join_trip().
drop policy if exists members_delete on public.trip_members;
create policy members_delete on public.trip_members for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists expenses_all on public.expenses;
create policy expenses_all on public.expenses for all to authenticated
  using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));

drop policy if exists settlements_all on public.settlements;
create policy settlements_all on public.settlements for all to authenticated
  using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));

drop policy if exists invites_select on public.trip_invites;
create policy invites_select on public.trip_invites for select to authenticated
  using (public.is_trip_member(trip_id));
drop policy if exists invites_insert on public.trip_invites;
create policy invites_insert on public.trip_invites for insert to authenticated
  with check (public.is_trip_member(trip_id) and created_by = auth.uid());
drop policy if exists invites_delete on public.trip_invites;
create policy invites_delete on public.trip_invites for delete to authenticated
  using (public.is_trip_member(trip_id));

drop policy if exists user_data_own on public.user_data;
create policy user_data_own on public.user_data for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.trips, public.trip_members, public.expenses, public.settlements,
  public.trip_invites, public.user_data from anon;
grant select, insert, update, delete on public.trips, public.expenses, public.settlements,
  public.trip_invites, public.user_data to authenticated;
grant select, delete on public.trip_members to authenticated;

-- ---------------------------------------------------------------------------
-- Invites
-- ---------------------------------------------------------------------------

-- What someone holding an invite link may see before joining.
create or replace function public.invite_preview(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_trip trips;
begin
  if auth.uid() is null then
    raise exception 'Sign in first';
  end if;
  select t.* into v_trip from trip_invites i join trips t on t.id = i.trip_id where i.code = p_code;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'tripId', v_trip.id,
    'name', v_trip.data ->> 'name',
    'destination', v_trip.data ->> 'destination',
    'startDate', v_trip.data ->> 'startDate',
    'endDate', v_trip.data ->> 'endDate',
    'people', coalesce(v_trip.data -> 'people', '[]'::jsonb),
    'claimedPersonIds', coalesce(
      (select jsonb_agg(person_id) from trip_members where trip_id = v_trip.id), '[]'::jsonb),
    'alreadyMember', exists (
      select 1 from trip_members where trip_id = v_trip.id and user_id = auth.uid())
  );
end;
$$;

-- Join via invite as an existing traveler (p_person_id) or as a new person
-- (p_new_person = {"id","name","email","color"}). Returns the trip id.
create or replace function public.join_trip(p_code text, p_person_id text, p_new_person jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip_id text;
  v_person_id text;
  v_data jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in first';
  end if;
  select trip_id into v_trip_id from trip_invites where code = p_code;
  if v_trip_id is null then
    raise exception 'This invite link is invalid or has been revoked';
  end if;
  if exists (select 1 from trip_members where trip_id = v_trip_id and user_id = auth.uid()) then
    return v_trip_id;
  end if;

  select data into v_data from trips where id = v_trip_id for update;

  if p_person_id is not null then
    if not exists (
      select 1 from jsonb_array_elements(coalesce(v_data -> 'people', '[]'::jsonb)) p
      where p ->> 'id' = p_person_id
    ) then
      raise exception 'That traveler is not on this trip';
    end if;
    if exists (select 1 from trip_members where trip_id = v_trip_id and person_id = p_person_id) then
      raise exception 'Someone has already joined as that traveler';
    end if;
    v_person_id := p_person_id;
  else
    v_person_id := coalesce(nullif(p_new_person ->> 'id', ''), gen_random_uuid()::text);
    v_data := jsonb_set(
      v_data, '{people}',
      coalesce(v_data -> 'people', '[]'::jsonb) || jsonb_build_object(
        'id', v_person_id,
        'name', coalesce(nullif(p_new_person ->> 'name', ''), 'Traveler'),
        'email', coalesce(p_new_person ->> 'email', ''),
        'color', coalesce(p_new_person ->> 'color', '#7C9A82')));
    v_data := jsonb_set(
      v_data, '{travelers}',
      coalesce(v_data -> 'travelers', '[]'::jsonb) || to_jsonb(v_person_id));
    update trips set data = v_data where id = v_trip_id;
  end if;

  insert into trip_members (trip_id, user_id, person_id) values (v_trip_id, auth.uid(), v_person_id);
  return v_trip_id;
end;
$$;

revoke all on function public.invite_preview(text) from public, anon;
revoke all on function public.join_trip(text, text, jsonb) from public, anon;
grant execute on function public.invite_preview(text) to authenticated;
grant execute on function public.join_trip(text, text, jsonb) to authenticated;
grant execute on function public.is_trip_member(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['trips', 'trip_members', 'expenses', 'settlements'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
