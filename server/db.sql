-- Civic Voice Portal - Supabase Database Schema
-- Paste this entire file into the Supabase SQL Editor and run it.

-- 1. Enable UUID generator if not enabled
create extension if not exists "uuid-ossp";

-- 2. Reports table
create table if not exists public.reports (
    id uuid primary key default gen_random_uuid(),
    token text unique not null,
    language_code text,
    transcript text,
    category text,
    severity text,
    summary text,
    photo_url text,
    photo_hash text,
    lat double precision,
    lng double precision,
    phone text,
    call_consent boolean not null default false,
    call_status text not null default 'NONE' check (call_status in ('NONE', 'CALLING', 'CONFIRMED', 'DISPUTED', 'NO_ANSWER', 'FAILED')),
    call_attempt_id text,
    status text not null default 'RECEIVED' check (status in ('RECEIVED', 'AWARDED', 'COMPLETED', 'REOPENED')),
    awarded_bid_id uuid,
    awarded_at timestamptz,
    citizen_verdict text,
    created_at timestamptz not null default now()
);

-- 3. Bids table
create table if not exists public.bids (
    id uuid primary key default gen_random_uuid(),
    report_id uuid not null references public.reports(id) on delete cascade,
    contractor text not null,
    cost integer not null,
    eta_days integer not null,
    created_at timestamptz not null default now()
);

-- 4. Foreign key for awarded_bid_id in reports
do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'fk_reports_awarded_bid'
    ) then
        alter table public.reports
        add constraint fk_reports_awarded_bid
        foreign key (awarded_bid_id) references public.bids(id) on delete set null;
    end if;
end $$;

-- 5. Completions table
create table if not exists public.completions (
    id uuid primary key default gen_random_uuid(),
    report_id uuid not null references public.reports(id) on delete cascade,
    photo_url text,
    photo_hash text,
    lat double precision,
    lng double precision,
    distance_m real,
    checks jsonb,
    passed boolean not null default false,
    created_at timestamptz not null default now()
);

-- 6. Indexes for fast lookups
create index if not exists idx_reports_token on public.reports(token);
create index if not exists idx_reports_status on public.reports(status);
create index if not exists idx_reports_call_attempt on public.reports(call_attempt_id);
create index if not exists idx_bids_report_id on public.bids(report_id);
create index if not exists idx_completions_report_id on public.completions(report_id);

-- 7. Ensure Storage bucket 'photos' exists and is public
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do update set public = true;

-- Policy to allow public read of photos
drop policy if exists "Public photo access" on storage.objects;
create policy "Public photo access"
on storage.objects for select
using (bucket_id = 'photos');

-- Policy to allow service-role / authenticated uploads
drop policy if exists "Service upload photo" on storage.objects;
create policy "Service upload photo"
on storage.objects for insert
with check (bucket_id = 'photos');
