-- KeepIt: вставьте в SQL Editor проекта Supabase.
-- Authentication → Providers → Email: выключите "Confirm email".

create table if not exists public.families (
  id uuid primary key,
  name text not null default 'Семья',
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  family_id uuid references public.families (id) on delete set null,
  display_name text not null,
  role text not null default 'member' check (role in ('admin', 'member', 'viewer')),
  created_at timestamptz not null default now()
);

create table if not exists public.invites (
  code text primary key,
  family_id uuid not null references public.families (id) on delete cascade,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);

create table if not exists public.places (
  id uuid primary key,
  family_id uuid not null references public.families (id) on delete cascade,
  parent_id uuid references public.places (id) on delete set null,
  object_key text not null check (object_key in ('home', 'dacha', 'work')),
  name text not null,
  type text not null,
  code text not null,
  note text not null default '',
  archived boolean not null default false,
  visibility text not null default 'shared' check (visibility in ('shared', 'personal')),
  version int not null default 1,
  updated_at timestamptz not null default now(),
  unique (family_id, code)
);

create table if not exists public.items (
  id uuid primary key,
  family_id uuid not null references public.families (id) on delete cascade,
  place_id uuid not null references public.places (id) on delete cascade,
  name text not null,
  mode text not null check (mode in ('durable', 'consumable')),
  category text not null default '',
  subcategory text not null default '',
  unit text not null check (unit in ('pcs', 'kg', 'pack')),
  quantity numeric(18, 4) not null default 0,
  note text not null default '',
  tags jsonb not null default '[]'::jsonb,
  needs_fill boolean not null default false,
  visibility text not null default 'shared' check (visibility in ('shared', 'personal')),
  version int not null default 1,
  updated_at timestamptz not null default now()
);

create index if not exists places_family_idx on public.places (family_id);
create index if not exists places_parent_idx on public.places (parent_id);
create index if not exists items_family_idx on public.items (family_id);
create index if not exists items_place_idx on public.items (place_id);

create or replace function public.my_family_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select family_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_family_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

alter table public.families enable row level security;
alter table public.profiles enable row level security;
alter table public.invites enable row level security;
alter table public.places enable row level security;
alter table public.items enable row level security;

drop policy if exists families_select on public.families;
create policy families_select on public.families
  for select using (id = public.my_family_id() or created_by = auth.uid());

drop policy if exists families_insert on public.families;
create policy families_insert on public.families
  for insert with check (created_by = auth.uid());

drop policy if exists families_update on public.families;
create policy families_update on public.families
  for update using (public.is_family_admin() and id = public.my_family_id());

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (
    id = auth.uid()
    or (family_id is not null and family_id = public.my_family_id())
  );

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert with check (id = auth.uid());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update using (id = auth.uid() or public.is_family_admin());

drop policy if exists invites_select on public.invites;
create policy invites_select on public.invites
  for select using (family_id = public.my_family_id());

drop policy if exists invites_insert on public.invites;
create policy invites_insert on public.invites
  for insert with check (public.is_family_admin() and family_id = public.my_family_id());

drop policy if exists invites_delete on public.invites;
create policy invites_delete on public.invites
  for delete using (public.is_family_admin() and family_id = public.my_family_id());

drop policy if exists places_all on public.places;
create policy places_all on public.places
  for all using (family_id = public.my_family_id())
  with check (family_id = public.my_family_id());

drop policy if exists items_all on public.items;
create policy items_all on public.items
  for all using (family_id = public.my_family_id())
  with check (family_id = public.my_family_id());

create or replace function public.redeem_invite(p_code text, p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_family uuid;
  v_expires timestamptz;
begin
  if v_uid is null then
    raise exception 'Нужна авторизация';
  end if;
  if length(trim(p_name)) < 1 then
    raise exception 'Укажите имя';
  end if;

  select family_id, expires_at into v_family, v_expires
  from public.invites
  where code = upper(replace(p_code, '-', ''))
  for update;

  if v_family is null then
    raise exception 'Код не найден';
  end if;
  if v_expires < now() then
    raise exception 'Срок кода истёк';
  end if;

  if exists (
    select 1 from public.profiles
    where family_id = v_family and lower(display_name) = lower(trim(p_name)) and id <> v_uid
  ) then
    raise exception 'Такое имя уже есть в семье';
  end if;

  insert into public.profiles (id, family_id, display_name, role)
  values (v_uid, v_family, trim(p_name), 'member')
  on conflict (id) do update
    set family_id = excluded.family_id,
        display_name = excluded.display_name,
        role = 'member';

  delete from public.invites where code = upper(replace(p_code, '-', ''));
  return v_family;
end;
$$;

grant execute on function public.redeem_invite(text, text) to authenticated;
