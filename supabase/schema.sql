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
create unique index if not exists sessions_session_date_key on sessions (session_date);

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

-- Booking manager schema
create table booking_settings (
  id boolean primary key default true,
  day_rate integer not null default 200,
  night_rate integer not null default 250,
  opening_time time not null default '06:00',
  closing_time time not null default '23:00',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

insert into booking_settings (id)
select true
where not exists (select 1 from booking_settings where id = true);

create table bookings (
  id uuid primary key default uuid_generate_v4(),
  player_name text not null,
  booking_date date not null,
  start_time time not null,
  end_time time not null,
  total_hours numeric(6,2) not null,
  rate_per_hour integer not null,
  total_amount integer not null,
  payment_status text not null default 'unpaid' check (payment_status in ('paid','unpaid','cancelled')),
  refund_status text not null default 'none' check (refund_status in ('none','partial','full')),
  refund_amount integer not null default 0,
  cancellation_reason text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint booking_time_valid check (end_time > start_time)
);

create table booking_payments (
  id uuid primary key default uuid_generate_v4(),
  booking_id uuid not null references bookings(id) on delete cascade,
  amount_paid integer not null,
  payment_method text,
  payment_timestamp timestamptz not null default now(),
  notes text
);

create table booking_cancellations (
  id uuid primary key default uuid_generate_v4(),
  booking_id uuid not null references bookings(id) on delete cascade,
  cancelled_at timestamptz not null default now(),
  cancellation_type text not null check (cancellation_type in ('unpaid_cancelled', 'partial_refund', 'full_refund')),
  refund_amount integer not null default 0,
  admin_notes text
);

create index if not exists bookings_booking_date_idx on bookings (booking_date);
create index if not exists bookings_player_name_idx on bookings (player_name);
create index if not exists booking_payments_booking_id_idx on booking_payments (booking_id);
create index if not exists booking_cancellations_booking_id_idx on booking_cancellations (booking_id);

alter table booking_settings enable row level security;
alter table bookings enable row level security;
alter table booking_payments enable row level security;
alter table booking_cancellations enable row level security;

create policy "booking_settings_select_authenticated" on booking_settings
  for select using (auth.role() = 'authenticated');
create policy "booking_settings_modify_admin" on booking_settings
  for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
  ) with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
  );

create policy "bookings_select_authenticated" on bookings
  for select using (auth.role() = 'authenticated');
create policy "bookings_modify_admin" on bookings
  for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
  ) with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
  );

create policy "booking_payments_select_authenticated" on booking_payments
  for select using (auth.role() = 'authenticated');
create policy "booking_payments_modify_admin" on booking_payments
  for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
  ) with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
  );

create policy "booking_cancellations_select_authenticated" on booking_cancellations
  for select using (auth.role() = 'authenticated');
create policy "booking_cancellations_modify_admin" on booking_cancellations
  for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
  ) with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
  );

create or replace function booking_settings_updated_at_trigger()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at_booking_settings on booking_settings;
create trigger set_updated_at_booking_settings
before update on booking_settings
for each row
execute procedure booking_settings_updated_at_trigger();

create or replace function bookings_updated_at_trigger()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at_bookings on bookings;
create trigger set_updated_at_bookings
before update on bookings
for each row
execute procedure bookings_updated_at_trigger();

create or replace function booking_rate_for_time(p_booking_date date, p_start_time time, p_end_time time)
returns table(
  day_hours numeric,
  night_hours numeric,
  total_hours numeric,
  rate_per_hour integer,
  total_amount integer
) as $$
declare
  settings_row booking_settings%rowtype;
  booking_start_minutes integer := extract(epoch from p_start_time)::integer / 60;
  booking_end_minutes integer := extract(epoch from p_end_time)::integer / 60;
  opening_minutes integer;
  closing_minutes integer;
  day_cutoff_minutes integer := 18 * 60;
  usable_start integer;
  usable_end integer;
  day_minutes integer;
  night_minutes integer;
begin
  select * into settings_row from booking_settings where id = true limit 1;
  if not found then
    settings_row.day_rate := 200;
    settings_row.night_rate := 250;
    settings_row.opening_time := time '06:00';
    settings_row.closing_time := time '23:00';
  end if;

  opening_minutes := extract(epoch from settings_row.opening_time)::integer / 60;
  closing_minutes := extract(epoch from settings_row.closing_time)::integer / 60;
  usable_start := greatest(booking_start_minutes, opening_minutes);
  usable_end := least(booking_end_minutes, closing_minutes);

  if usable_end <= usable_start then
    raise exception 'booking is outside operating hours';
  end if;

  day_minutes := greatest(0, least(usable_end, day_cutoff_minutes) - usable_start);
  night_minutes := greatest(0, usable_end - greatest(usable_start, day_cutoff_minutes));

  day_hours := round(day_minutes::numeric / 60, 2);
  night_hours := round(night_minutes::numeric / 60, 2);
  total_hours := round((usable_end - usable_start)::numeric / 60, 2);
  rate_per_hour := case when night_minutes > 0 and day_minutes = 0 then settings_row.night_rate
    when day_minutes > 0 and night_minutes = 0 then settings_row.day_rate
    else settings_row.day_rate end;
  total_amount := round(day_hours * settings_row.day_rate + night_hours * settings_row.night_rate)::integer;

  return next;
end;
$$ language plpgsql stable;

create or replace function booking_overlap_guard()
returns trigger as $$
begin
  if exists (
    select 1
    from bookings b
    where b.booking_date = new.booking_date
      and b.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and new.start_time < b.end_time
      and new.end_time > b.start_time
      and b.payment_status <> 'cancelled'
  ) then
    raise exception 'booking overlaps with an existing reservation';
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists prevent_booking_overlap on bookings;
create trigger prevent_booking_overlap
before insert or update on bookings
for each row
execute procedure booking_overlap_guard();

create or replace function create_booking(
  p_player_name text,
  p_booking_date date,
  p_start_time time,
  p_end_time time,
  p_notes text default null
)
returns uuid as $$
declare
  pricing record;
  booking_id uuid;
begin
  select * into pricing from booking_rate_for_time(p_booking_date, p_start_time, p_end_time);

  insert into bookings (
    player_name,
    booking_date,
    start_time,
    end_time,
    total_hours,
    rate_per_hour,
    total_amount,
    notes
  ) values (
    p_player_name,
    p_booking_date,
    p_start_time,
    p_end_time,
    pricing.total_hours,
    pricing.rate_per_hour,
    pricing.total_amount,
    p_notes
  ) returning id into booking_id;

  return booking_id;
end;
$$ language plpgsql security definer;

create or replace function mark_booking_paid(p_booking_id uuid, p_amount integer, p_method text default null, p_notes text default null)
returns void as $$
begin
  update bookings
    set payment_status = 'paid'
    where id = p_booking_id;

  insert into booking_payments(booking_id, amount_paid, payment_method, notes)
  values (p_booking_id, p_amount, p_method, p_notes);
end;
$$ language plpgsql security definer;

create or replace function cancel_booking(p_booking_id uuid, p_cancel_type text default 'unpaid_cancelled', p_admin_notes text default null)
returns void as $$
declare
  booking_row bookings%rowtype;
  refund integer := 0;
begin
  select * into booking_row from bookings where id = p_booking_id;
  if not found then
    raise exception 'booking not found';
  end if;

  if booking_row.payment_status = 'unpaid' then
    update bookings
      set payment_status = 'cancelled', refund_status = 'none', refund_amount = 0, cancellation_reason = p_admin_notes
      where id = p_booking_id;

    insert into booking_cancellations(booking_id, cancellation_type, refund_amount, admin_notes)
    values (p_booking_id, 'unpaid_cancelled', 0, p_admin_notes);
    return;
  end if;

  if p_cancel_type = 'partial_refund' then
    refund := round(booking_row.total_amount * 0.5)::integer;
    update bookings
      set payment_status = 'cancelled', refund_status = 'partial', refund_amount = refund, cancellation_reason = p_admin_notes
      where id = p_booking_id;
    insert into booking_cancellations(booking_id, cancellation_type, refund_amount, admin_notes)
    values (p_booking_id, 'partial_refund', refund, p_admin_notes);
    insert into booking_payments(booking_id, amount_paid, payment_method, notes)
    values (p_booking_id, -refund, 'refund', 'partial refund');
  elsif p_cancel_type = 'full_refund' then
    refund := booking_row.total_amount;
    update bookings
      set payment_status = 'cancelled', refund_status = 'full', refund_amount = refund, cancellation_reason = p_admin_notes
      where id = p_booking_id;
    insert into booking_cancellations(booking_id, cancellation_type, refund_amount, admin_notes)
    values (p_booking_id, 'full_refund', refund, p_admin_notes);
    insert into booking_payments(booking_id, amount_paid, payment_method, notes)
    values (p_booking_id, -refund, 'refund', 'full refund');
  else
    update bookings
      set payment_status = 'cancelled', refund_status = 'none', refund_amount = 0, cancellation_reason = p_admin_notes
      where id = p_booking_id;

    insert into booking_cancellations(booking_id, cancellation_type, refund_amount, admin_notes)
    values (p_booking_id, 'unpaid_cancelled', 0, p_admin_notes);
  end if;
end;
$$ language plpgsql security definer;

create or replace view booking_daily_sales as
select
  b.booking_date,
  coalesce(sum(case when p.amount_paid > 0 then p.amount_paid else 0 end), 0) as gross_payments,
  coalesce(sum(case when p.amount_paid < 0 then abs(p.amount_paid) else 0 end), 0) as refunds,
  coalesce(sum(p.amount_paid), 0) as net_sales
from bookings b
left join booking_payments p on p.booking_id = b.id
group by b.booking_date;

grant select on booking_settings to authenticated;
grant select on bookings to authenticated;
grant select on booking_payments to authenticated;
grant select on booking_cancellations to authenticated;
grant select on booking_daily_sales to authenticated;
