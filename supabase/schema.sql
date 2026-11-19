-- Groceries schema. Paste into Supabase: SQL Editor -> New query -> Run.

create extension if not exists pgcrypto;

create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Our household',
  join_code text not null unique default upper(substr(md5(random()::text), 1, 6)),
  created_at timestamptz not null default now()
);

create table household_members (
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table sections (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  sort int not null default 0
);

create table recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  url text,
  notes text,
  created_at timestamptz not null default now()
);

create table recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  recipe_id uuid not null references recipes(id) on delete cascade,
  name text not null,
  qty text
);

create table items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  section_id uuid references sections(id) on delete set null,
  recipe_id uuid references recipes(id) on delete set null,
  name text not null,
  qty text,
  checked boolean not null default false,
  added_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table meal_plan (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  day date not null,
  recipe_id uuid references recipes(id) on delete cascade,
  label text,
  created_at timestamptz not null default now()
);

create table price_logs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  item_key text not null,          -- lower-cased, trimmed item name
  item_name text not null,
  store text not null,
  price numeric(10,2) not null check (price >= 0),
  logged_by uuid references auth.users(id) default auth.uid(),
  logged_at timestamptz not null default now()
);
create index price_logs_lookup on price_logs (household_id, item_key, logged_at desc);

-- Membership helper used by row level security.
create or replace function is_member(h uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from household_members where household_id = h and user_id = auth.uid());
$$;

alter table households enable row level security;
alter table household_members enable row level security;
alter table sections enable row level security;
alter table recipes enable row level security;
alter table recipe_ingredients enable row level security;
alter table items enable row level security;
alter table meal_plan enable row level security;
alter table price_logs enable row level security;

create policy "members read household" on households for select using (is_member(id));
create policy "members update household" on households for update using (is_member(id));
create policy "members read members" on household_members for select using (is_member(household_id));

do $$
declare t text;
begin
  foreach t in array array['sections','recipes','recipe_ingredients','items','meal_plan','price_logs'] loop
    execute format('create policy "members all" on %I for all using (is_member(household_id)) with check (is_member(household_id))', t);
  end loop;
end $$;

-- Create a household for the signed-in user, with starter sections.
create or replace function create_household(display text) returns uuid
language plpgsql security definer set search_path = public as $$
declare h uuid;
begin
  insert into households default values returning id into h;
  insert into household_members (household_id, user_id, display_name) values (h, auth.uid(), display);
  insert into sections (household_id, name, sort) values
    (h, 'Produce', 1), (h, 'Meat & Seafood', 2), (h, 'Dairy & Eggs', 3), (h, 'Pantry', 4),
    (h, 'Frozen', 5), (h, 'Household', 6), (h, 'Other', 7);
  return h;
end $$;

-- Join an existing household with its 6-character code.
create or replace function join_household(code text, display text) returns uuid
language plpgsql security definer set search_path = public as $$
declare h uuid;
begin
  select id into h from households where join_code = upper(trim(code));
  if h is null then raise exception 'No household with that code'; end if;
  insert into household_members (household_id, user_id, display_name) values (h, auth.uid(), display)
    on conflict do nothing;
  return h;
end $$;

-- Let signed-in users reach the tables through the app (row level security still limits them to their own household).
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function is_member(uuid), create_household(text), join_household(text, text) to authenticated;
notify pgrst, 'reload schema';

-- Live sync.
alter publication supabase_realtime add table sections, recipes, recipe_ingredients, items, meal_plan, price_logs;
