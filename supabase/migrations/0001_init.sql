create table sessions (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  code_expires_at timestamptz not null default now() + interval '15 minutes',
  paired_at timestamptz,
  phone_key text not null,
  remote_key text not null,
  mode text not null check (mode in ('self','therapist','judge')),
  fear text not null, feared_outcome text, expectancy_pre int,
  ladder_id uuid, seed int not null default 2026,
  consent_record boolean not null default false,
  status text not null default 'created',
  created_at timestamptz default now(), ended_at timestamptz
);
create table ladders (
  id uuid primary key default gen_random_uuid(),
  fear_hash text unique not null, fear text, source text not null,
  plan jsonb not null, lint jsonb, created_at timestamptz default now()
);
create table trials (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions on delete cascade,
  idx int not null, context text, start_level int, max_level int,
  receipt jsonb, recording_path text, recording_sha256 text,
  created_at timestamptz default now()
);
create table events (
  id bigserial primary key,
  session_id uuid references sessions on delete cascade,
  trial_idx int, t_ms bigint not null, kind text not null, payload jsonb
);
create index events_session_idx on events (session_id, t_ms);
create table orbis_slot (id int primary key default 1, holder uuid, lease_until timestamptz);
insert into orbis_slot (id) values (1);
create table ip_quota (ip_hash text, day date, sessions int default 0, primary key (ip_hash, day));
alter table sessions enable row level security;
alter table ladders enable row level security;
alter table trials enable row level security;
alter table events enable row level security;
alter table orbis_slot enable row level security;
alter table ip_quota enable row level security;
-- No client policies: all table access goes through server routes with the service role.

create or replace function acquire_slot(p_holder uuid, p_lease_s int default 600)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update orbis_slot s
     set holder = p_holder, lease_until = now() + make_interval(secs => p_lease_s)
   where s.id = 1 and (s.holder is null or s.lease_until < now() or s.holder = p_holder);
  return found;
end $$;

create or replace function release_slot(p_holder uuid)
returns void language sql security definer set search_path = public as $$
  update orbis_slot set holder = null, lease_until = null where id = 1 and holder = p_holder;
$$;

create or replace function bump_quota(p_ip_hash text, p_max int)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into ip_quota as q (ip_hash, day, sessions) values (p_ip_hash, current_date, 1)
  on conflict (ip_hash, day) do update set sessions = q.sessions + 1
  returning q.sessions into n;
  return n <= p_max;
end $$;

revoke execute on function acquire_slot(uuid, int), release_slot(uuid), bump_quota(text, int)
  from public, anon, authenticated;

-- Recordings are private; uploads go through signed URLs minted by /api/recording.
insert into storage.buckets (id, name, public) values ('recordings', 'recordings', false)
on conflict (id) do nothing;
