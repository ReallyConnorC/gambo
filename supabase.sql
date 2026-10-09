-- Run in Supabase SQL editor
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text,
  balance bigint not null default 1000,
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;
create policy "read own" on public.profiles for select using (auth.uid() = id);
create policy "insert own" on public.profiles for insert with check (auth.uid() = id);
create policy "update own" on public.profiles for update using (auth.uid() = id);
-- Leaderboard: everyone can see usernames + balances
create policy "read all" on public.profiles for select using (true);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username)
  values (new.id, coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)));
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
