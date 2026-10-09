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

-- Change your own balance by an amount (never below 0). Returns the new balance.
create or replace function public.add_balance(delta bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare nb bigint;
begin
  update profiles set balance = greatest(0, balance + delta) where id = auth.uid() returning balance into nb;
  return nb;
end $$;

-- Send coins to another player by username. Returns your new balance.
create or replace function public.send_coins(to_username text, amount bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare rid uuid; matches int; nb bigint;
begin
  if amount is null or amount < 1 then raise exception 'Enter an amount of at least 1'; end if;
  select count(*), min(id::text)::uuid into matches, rid from profiles where lower(username) = lower(trim(to_username));
  if matches = 0 then raise exception 'No player called %', to_username; end if;
  if matches > 1 then raise exception 'More than one player is called %', to_username; end if;
  if rid = auth.uid() then raise exception 'You can''t send coins to yourself'; end if;
  update profiles set balance = balance - amount where id = auth.uid() and balance >= amount returning balance into nb;
  if nb is null then raise exception 'Not enough coins'; end if;
  update profiles set balance = balance + amount where id = rid;
  return nb;
end $$;

revoke execute on function public.add_balance(bigint), public.send_coins(text, bigint) from public, anon;
grant execute on function public.add_balance(bigint), public.send_coins(text, bigint) to authenticated;
