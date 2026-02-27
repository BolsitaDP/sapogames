create extension if not exists pgcrypto;

create table if not exists public.game_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  game_slug text not null check (game_slug = 'rps'),
  host_player_id uuid,
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'finished')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  nickname text not null,
  is_host boolean not null default false,
  player_secret text not null,
  joined_at timestamptz not null default now()
);

create table if not exists public.rps_rounds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  round_number integer not null,
  status text not null default 'pending' check (status in ('pending', 'revealed')),
  winner_player_id uuid references public.room_players(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.rps_moves (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  round_id uuid not null references public.rps_rounds(id) on delete cascade,
  player_id uuid not null references public.room_players(id) on delete cascade,
  choice text not null check (choice in ('rock', 'paper', 'scissors')),
  created_at timestamptz not null default now(),
  unique (round_id, player_id)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'rps_rounds_room_round_unique'
  ) then
    alter table public.rps_rounds
      add constraint rps_rounds_room_round_unique unique (room_id, round_number);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'game_rooms_host_player_fk'
  ) then
    alter table public.game_rooms
      add constraint game_rooms_host_player_fk
      foreign key (host_player_id)
      references public.room_players(id)
      on delete set null;
  end if;
end $$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_game_rooms_updated_at on public.game_rooms;
create trigger trg_game_rooms_updated_at
before update on public.game_rooms
for each row
execute function public.touch_updated_at();

create or replace function public.generate_room_code(code_length integer default 6)
returns text
language plpgsql
as $$
declare
  chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text := '';
  idx integer;
begin
  loop
    candidate := '';

    for idx in 1..code_length loop
      candidate := candidate || substr(chars, 1 + floor(random() * length(chars))::integer, 1);
    end loop;

    exit when not exists (
      select 1
      from public.game_rooms
      where code = candidate
    );
  end loop;

  return candidate;
end;
$$;

create or replace function public.resolve_rps_winner(first_choice text, second_choice text)
returns integer
language sql
immutable
as $$
  select case
    when first_choice = second_choice then 0
    when (first_choice = 'rock' and second_choice = 'scissors')
      or (first_choice = 'paper' and second_choice = 'rock')
      or (first_choice = 'scissors' and second_choice = 'paper') then 1
    else 2
  end;
$$;

create or replace function public.create_rps_room(host_nickname text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.game_rooms;
  v_host public.room_players;
  v_secret text := encode(gen_random_bytes(16), 'hex');
begin
  if host_nickname is null or btrim(host_nickname) = '' then
    raise exception 'El apodo no puede estar vacio.';
  end if;

  insert into public.game_rooms (code, game_slug)
  values (public.generate_room_code(), 'rps')
  returning * into v_room;

  insert into public.room_players (room_id, nickname, is_host, player_secret)
  values (v_room.id, left(btrim(host_nickname), 24), true, v_secret)
  returning * into v_host;

  update public.game_rooms
  set host_player_id = v_host.id
  where id = v_room.id;

  insert into public.rps_rounds (room_id, round_number)
  values (v_room.id, 1);

  return jsonb_build_object(
    'nickname', v_host.nickname,
    'playerId', v_host.id,
    'playerSecret', v_secret,
    'roomCode', v_room.code,
    'roomId', v_room.id
  );
end;
$$;

create or replace function public.join_rps_room(room_code_input text, player_nickname text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.game_rooms;
  v_player public.room_players;
  v_secret text := encode(gen_random_bytes(16), 'hex');
  v_players_count integer;
begin
  if player_nickname is null or btrim(player_nickname) = '' then
    raise exception 'El apodo no puede estar vacio.';
  end if;

  select *
  into v_room
  from public.game_rooms
  where code = upper(btrim(room_code_input))
    and game_slug = 'rps'
  limit 1;

  if not found then
    raise exception 'La sala no existe.';
  end if;

  select count(*)
  into v_players_count
  from public.room_players
  where room_id = v_room.id;

  if v_players_count >= 2 then
    raise exception 'La sala ya esta completa.';
  end if;

  insert into public.room_players (room_id, nickname, is_host, player_secret)
  values (v_room.id, left(btrim(player_nickname), 24), false, v_secret)
  returning * into v_player;

  update public.game_rooms
  set status = 'playing'
  where id = v_room.id;

  return jsonb_build_object(
    'nickname', v_player.nickname,
    'playerId', v_player.id,
    'playerSecret', v_secret,
    'roomCode', v_room.code,
    'roomId', v_room.id
  );
end;
$$;

create or replace function public.submit_rps_move(
  room_code_input text,
  player_id_input uuid,
  player_secret_input text,
  player_choice text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.game_rooms;
  v_player public.room_players;
  v_round public.rps_rounds;
  v_move_count integer;
  v_player_count integer;
  v_move_one public.rps_moves;
  v_move_two public.rps_moves;
  v_winner integer;
  v_winner_player_id uuid;
begin
  if player_choice not in ('rock', 'paper', 'scissors') then
    raise exception 'Jugada invalida.';
  end if;

  select *
  into v_room
  from public.game_rooms
  where code = upper(btrim(room_code_input))
    and game_slug = 'rps'
  limit 1;

  if not found then
    raise exception 'La sala no existe.';
  end if;

  select *
  into v_player
  from public.room_players
  where id = player_id_input
    and room_id = v_room.id
    and player_secret = player_secret_input
  limit 1;

  if not found then
    raise exception 'La sesion del jugador no es valida.';
  end if;

  select *
  into v_round
  from public.rps_rounds
  where room_id = v_room.id
  order by round_number desc
  limit 1;

  if v_round.status <> 'pending' then
    raise exception 'La ronda actual ya esta cerrada.';
  end if;

  insert into public.rps_moves (room_id, round_id, player_id, choice)
  values (v_room.id, v_round.id, v_player.id, player_choice)
  on conflict (round_id, player_id)
  do update set
    choice = excluded.choice,
    created_at = now();

  select count(*)
  into v_move_count
  from public.rps_moves
  where round_id = v_round.id;

  select count(*)
  into v_player_count
  from public.room_players
  where room_id = v_room.id;

  if v_player_count = 2 and v_move_count = 2 then
    select *
    into v_move_one
    from public.rps_moves
    where round_id = v_round.id
    order by created_at asc
    limit 1;

    select *
    into v_move_two
    from public.rps_moves
    where round_id = v_round.id
      and id <> v_move_one.id
    limit 1;

    v_winner := public.resolve_rps_winner(v_move_one.choice, v_move_two.choice);

    if v_winner = 1 then
      v_winner_player_id := v_move_one.player_id;
    elsif v_winner = 2 then
      v_winner_player_id := v_move_two.player_id;
    else
      v_winner_player_id := null;
    end if;

    update public.rps_rounds
    set
      status = 'revealed',
      winner_player_id = v_winner_player_id,
      resolved_at = now()
    where id = v_round.id;
  end if;

  return jsonb_build_object(
    'ok', true
  );
end;
$$;

create or replace function public.start_next_rps_round(
  room_code_input text,
  player_id_input uuid,
  player_secret_input text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.game_rooms;
  v_player public.room_players;
  v_round public.rps_rounds;
  v_pending_round public.rps_rounds;
begin
  select *
  into v_room
  from public.game_rooms
  where code = upper(btrim(room_code_input))
    and game_slug = 'rps'
  limit 1;

  if not found then
    raise exception 'La sala no existe.';
  end if;

  select *
  into v_player
  from public.room_players
  where id = player_id_input
    and room_id = v_room.id
    and player_secret = player_secret_input
  limit 1;

  if not found then
    raise exception 'La sesion del jugador no es valida.';
  end if;

  select *
  into v_pending_round
  from public.rps_rounds
  where room_id = v_room.id
    and status = 'pending'
  order by round_number desc
  limit 1;

  if found then
    return jsonb_build_object(
      'roundId', v_pending_round.id,
      'roundNumber', v_pending_round.round_number
    );
  end if;

  select *
  into v_round
  from public.rps_rounds
  where room_id = v_room.id
  order by round_number desc
  limit 1;

  if v_round.status <> 'revealed' then
    raise exception 'La ronda actual todavia no termina.';
  end if;

  begin
    insert into public.rps_rounds (room_id, round_number, status)
    values (v_room.id, v_round.round_number + 1, 'pending')
    returning * into v_pending_round;
  exception
    when unique_violation then
      select *
      into v_pending_round
      from public.rps_rounds
      where room_id = v_room.id
      order by round_number desc
      limit 1;
  end;

  return jsonb_build_object(
    'roundId', v_pending_round.id,
    'roundNumber', v_pending_round.round_number
  );
end;
$$;

create or replace function public.get_rps_room_snapshot(room_code_input text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.game_rooms;
  v_round public.rps_rounds;
begin
  select *
  into v_room
  from public.game_rooms
  where code = upper(btrim(room_code_input))
    and game_slug = 'rps'
  limit 1;

  if not found then
    raise exception 'La sala no existe.';
  end if;

  select *
  into v_round
  from public.rps_rounds
  where room_id = v_room.id
  order by round_number desc
  limit 1;

  return jsonb_build_object(
    'roomId', v_room.id,
    'roomCode', v_room.code,
    'gameSlug', v_room.game_slug,
    'roomStatus', v_room.status,
    'createdAt', v_room.created_at,
    'playerCount', (
      select count(*)
      from public.room_players
      where room_id = v_room.id
    ),
    'players', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'nickname', p.nickname,
          'isHost', p.is_host,
          'joinedAt', p.joined_at
        )
        order by p.joined_at asc
      )
      from public.room_players p
      where p.room_id = v_room.id
    ), '[]'::jsonb),
    'currentRound', jsonb_build_object(
      'id', v_round.id,
      'roundNumber', v_round.round_number,
      'status', v_round.status,
      'winnerPlayerId', v_round.winner_player_id,
      'winnerNickname', (
        select nickname
        from public.room_players
        where id = v_round.winner_player_id
      ),
      'submittedCount', (
        select count(*)
        from public.rps_moves
        where round_id = v_round.id
      ),
      'submittedPlayerIds', coalesce((
        select jsonb_agg(m.player_id)
        from public.rps_moves m
        where m.round_id = v_round.id
      ), '[]'::jsonb),
      'revealedMoves', case
        when v_round.status = 'revealed' then coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'playerId', p.id,
              'nickname', p.nickname,
              'choice', m.choice
            )
            order by p.joined_at asc
          )
          from public.rps_moves m
          join public.room_players p on p.id = m.player_id
          where m.round_id = v_round.id
        ), '[]'::jsonb)
        else '[]'::jsonb
      end
    )
  );
end;
$$;

alter table public.game_rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.rps_rounds enable row level security;
alter table public.rps_moves enable row level security;

drop policy if exists "public read rooms" on public.game_rooms;
create policy "public read rooms"
on public.game_rooms
for select
using (true);

drop policy if exists "public read players" on public.room_players;
create policy "public read players"
on public.room_players
for select
using (true);

drop policy if exists "public read rounds" on public.rps_rounds;
create policy "public read rounds"
on public.rps_rounds
for select
using (true);

drop policy if exists "public read moves" on public.rps_moves;
create policy "public read moves"
on public.rps_moves
for select
using (true);

grant select on public.game_rooms to anon, authenticated;
grant select on public.room_players to anon, authenticated;
grant select on public.rps_rounds to anon, authenticated;
grant select on public.rps_moves to anon, authenticated;

revoke all on function public.create_rps_room(text) from public;
revoke all on function public.join_rps_room(text, text) from public;
revoke all on function public.submit_rps_move(text, uuid, text, text) from public;
revoke all on function public.start_next_rps_round(text, uuid, text) from public;
revoke all on function public.get_rps_room_snapshot(text) from public;

grant execute on function public.create_rps_room(text) to anon, authenticated;
grant execute on function public.join_rps_room(text, text) to anon, authenticated;
grant execute on function public.submit_rps_move(text, uuid, text, text) to anon, authenticated;
grant execute on function public.start_next_rps_round(text, uuid, text) to anon, authenticated;
grant execute on function public.get_rps_room_snapshot(text) to anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_rel rel
    join pg_class cls on cls.oid = rel.prrelid
    join pg_publication pub on pub.oid = rel.prpubid
    where pub.pubname = 'supabase_realtime'
      and cls.relname = 'game_rooms'
  ) then
    alter publication supabase_realtime add table public.game_rooms;
  end if;

  if not exists (
    select 1
    from pg_publication_rel rel
    join pg_class cls on cls.oid = rel.prrelid
    join pg_publication pub on pub.oid = rel.prpubid
    where pub.pubname = 'supabase_realtime'
      and cls.relname = 'room_players'
  ) then
    alter publication supabase_realtime add table public.room_players;
  end if;

  if not exists (
    select 1
    from pg_publication_rel rel
    join pg_class cls on cls.oid = rel.prrelid
    join pg_publication pub on pub.oid = rel.prpubid
    where pub.pubname = 'supabase_realtime'
      and cls.relname = 'rps_rounds'
  ) then
    alter publication supabase_realtime add table public.rps_rounds;
  end if;

  if not exists (
    select 1
    from pg_publication_rel rel
    join pg_class cls on cls.oid = rel.prrelid
    join pg_publication pub on pub.oid = rel.prpubid
    where pub.pubname = 'supabase_realtime'
      and cls.relname = 'rps_moves'
  ) then
    alter publication supabase_realtime add table public.rps_moves;
  end if;
end $$;
