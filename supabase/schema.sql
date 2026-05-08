-- Supabase schema for Pickleball Open Play Manager

create extension if not exists "uuid-ossp";

-- profiles table to store admin flag
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  is_admin boolean default false,
  created_at timestamptz default now()
);

create table sessions (
  id uuid primary key default uuid_generate_v4(),
  session_date date not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table players (
  id uuid primary key default uuid_generate_v4(),
  full_name text not null,
  created_at timestamptz default now()
);

create table attendance (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references sessions(id) on delete cascade,
  player_id uuid references players(id) on delete cascade,
  amount integer not null default 50,
  payment_status text not null check (payment_status in ('paid','unpaid')) default 'unpaid',
  paid_at timestamptz,
  created_at timestamptz default now()
);

create table payment_history (
  id uuid primary key default uuid_generate_v4(),
  attendance_id uuid references attendance(id) on delete cascade,
  amount_paid integer not null,
  payment_date timestamptz default now(),
  notes text
);

-- Row Level Security: restrict modifications to admin profiles only

alter table profiles enable row level security;
create policy "profiles_admin_only" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- Sessions, players, attendance and payment_history: RLS allow read to authenticated, writes only for admins

alter table sessions enable row level security;
create policy "sessions_select_authenticated" on sessions
  for select using (auth.role() = 'authenticated');
create policy "sessions_modify_admin" on sessions
  for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
  ) with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
  );

alter table players enable row level security;
create policy "players_select_authenticated" on players
  for select using (auth.role() = 'authenticated');
create policy "players_modify_admin" on players
  for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
  ) with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
  );

alter table attendance enable row level security;
create policy "attendance_select_authenticated" on attendance
  for select using (auth.role() = 'authenticated');
create policy "attendance_modify_admin" on attendance
  for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
  ) with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
  );

alter table payment_history enable row level security;
create policy "payments_select_authenticated" on payment_history
  for select using (auth.role() = 'authenticated');
create policy "payments_modify_admin" on payment_history
  for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
  ) with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
  );

-- Indexes
create index on attendance (player_id);
create index on attendance (session_id);
create index on players (full_name);

-- Automatically update sessions.updated_at on change
create or replace function sessions_updated_at_trigger()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at on sessions;
create trigger set_updated_at
before update on sessions
for each row
execute procedure sessions_updated_at_trigger();

-- Helper: ensure a session exists for a given date and return its id
create or replace function ensure_session(p_date date)
returns uuid as $$
declare
  s_id uuid;
begin
  select id into s_id from sessions where session_date = p_date limit 1;
  if s_id is null then
    insert into sessions(session_date) values (p_date) returning id into s_id;
  end if;
  return s_id;
end;
$$ language plpgsql;

-- RPC to mark attendance as paid and insert into payment_history atomically
create or replace function mark_attendance_paid(p_attendance_id uuid, p_amount integer, p_notes text default null)
returns void as $$
begin
  update attendance set payment_status = 'paid', paid_at = now(), amount = coalesce(p_amount, amount)
    where id = p_attendance_id;

  insert into payment_history(attendance_id, amount_paid, notes)
    values (p_attendance_id, p_amount, p_notes);
end;
$$ language plpgsql;

-- View: aggregate unpaid debts per player
create or replace view player_debts as
select
  p.id as player_id,
  p.full_name,
  json_agg(json_build_object(
    'attendance_id', a.id,
    'session_date', s.session_date,
    'amount', a.amount,
    'payment_status', a.payment_status,
    'created_at', a.created_at
  ) order by s.session_date desc) filter (where a.payment_status = 'unpaid') as unpaid_entries,
  coalesce(sum(case when a.payment_status = 'unpaid' then a.amount else 0 end),0) as total_debt,
  coalesce(count(a.*),0) as total_sessions
from players p
left join attendance a on a.player_id = p.id
left join sessions s on s.id = a.session_id
group by p.id, p.full_name;

-- Grant select on views to authenticated
grant select on player_debts to authenticated;
