create extension if not exists pgcrypto with schema extensions;

create table if not exists public.game_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  game_slug text not null check (game_slug = 'rps'),
  host_player_id uuid,
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'finished')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.game_rooms drop constraint if exists game_rooms_game_slug_check;
alter table public.game_rooms
  add constraint game_rooms_game_slug_check
  check (game_slug in ('rps', 'ttt', 'bj', 'bjd'));

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

create table if not exists public.ttt_rounds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  round_number integer not null,
  status text not null default 'pending' check (status in ('pending', 'revealed')),
  starting_player_id uuid not null references public.room_players(id) on delete cascade,
  next_player_id uuid references public.room_players(id) on delete set null,
  winner_player_id uuid references public.room_players(id) on delete set null,
  board text[] not null default array['', '', '', '', '', '', '', '', '']::text[],
  move_count integer not null default 0,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.bj_rounds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  round_number integer not null,
  status text not null check (status in ('player_turn', 'dealer_turn', 'revealed')),
  starting_player_id uuid not null references public.room_players(id) on delete cascade,
  current_turn_player_id uuid references public.room_players(id) on delete set null,
  dealer_cards text[] not null default array[]::text[],
  deck text[] not null default array[]::text[],
  next_card_index integer not null default 1,
  dealer_total integer,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.bj_player_hands (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  round_id uuid not null references public.bj_rounds(id) on delete cascade,
  player_id uuid not null references public.room_players(id) on delete cascade,
  cards text[] not null default array[]::text[],
  turn_status text not null default 'waiting' check (turn_status in ('waiting', 'active', 'stood', 'bust', 'blackjack')),
  outcome text check (outcome in ('win', 'lose', 'push')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (round_id, player_id)
);

create table if not exists public.bjd_rounds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  round_number integer not null,
  status text not null default 'pending' check (status in ('pending', 'revealed')),
  deck text[] not null default array[]::text[],
  next_card_index integer not null default 1,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.bjd_player_hands (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  round_id uuid not null references public.bjd_rounds(id) on delete cascade,
  player_id uuid not null references public.room_players(id) on delete cascade,
  cards text[] not null default array[]::text[],
  turn_status text not null default 'active' check (turn_status in ('active', 'stood', 'bust', 'blackjack')),
  outcome text check (outcome in ('win', 'lose', 'push')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
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
    where conname = 'ttt_rounds_room_round_unique'
  ) then
    alter table public.ttt_rounds
      add constraint ttt_rounds_room_round_unique unique (room_id, round_number);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bj_rounds_room_round_unique'
  ) then
    alter table public.bj_rounds
      add constraint bj_rounds_room_round_unique unique (room_id, round_number);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bjd_rounds_room_round_unique'
  ) then
    alter table public.bjd_rounds
      add constraint bjd_rounds_room_round_unique unique (room_id, round_number);
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

drop trigger if exists trg_bj_player_hands_updated_at on public.bj_player_hands;
create trigger trg_bj_player_hands_updated_at
before update on public.bj_player_hands
for each row
execute function public.touch_updated_at();

drop trigger if exists trg_bjd_player_hands_updated_at on public.bjd_player_hands;
create trigger trg_bjd_player_hands_updated_at
before update on public.bjd_player_hands
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
set search_path = public, extensions
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
set search_path = public, extensions
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
set search_path = public, extensions
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
set search_path = public, extensions
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
set search_path = public, extensions
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
          'joinedAt', p.joined_at,
          'score', (
            select count(*)
            from public.rps_rounds rr
            where rr.room_id = v_room.id
              and rr.winner_player_id = p.id
          )
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

create or replace function public.resolve_ttt_winner(board_input text[])
returns text
language sql
immutable
as $$
  select case
    when board_input[1] <> '' and board_input[1] = board_input[2] and board_input[2] = board_input[3] then board_input[1]
    when board_input[4] <> '' and board_input[4] = board_input[5] and board_input[5] = board_input[6] then board_input[4]
    when board_input[7] <> '' and board_input[7] = board_input[8] and board_input[8] = board_input[9] then board_input[7]
    when board_input[1] <> '' and board_input[1] = board_input[4] and board_input[4] = board_input[7] then board_input[1]
    when board_input[2] <> '' and board_input[2] = board_input[5] and board_input[5] = board_input[8] then board_input[2]
    when board_input[3] <> '' and board_input[3] = board_input[6] and board_input[6] = board_input[9] then board_input[3]
    when board_input[1] <> '' and board_input[1] = board_input[5] and board_input[5] = board_input[9] then board_input[1]
    when board_input[3] <> '' and board_input[3] = board_input[5] and board_input[5] = board_input[7] then board_input[3]
    else null
  end;
$$;

create or replace function public.create_ttt_room(host_nickname text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
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
  values (public.generate_room_code(), 'ttt')
  returning * into v_room;

  insert into public.room_players (room_id, nickname, is_host, player_secret)
  values (v_room.id, left(btrim(host_nickname), 24), true, v_secret)
  returning * into v_host;

  update public.game_rooms
  set host_player_id = v_host.id
  where id = v_room.id;

  insert into public.ttt_rounds (room_id, round_number, starting_player_id, next_player_id)
  values (v_room.id, 1, v_host.id, v_host.id);

  return jsonb_build_object(
    'nickname', v_host.nickname,
    'playerId', v_host.id,
    'playerSecret', v_secret,
    'roomCode', v_room.code,
    'roomId', v_room.id
  );
end;
$$;

create or replace function public.join_ttt_room(room_code_input text, player_nickname text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
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
    and game_slug = 'ttt'
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

create or replace function public.submit_ttt_move(
  room_code_input text,
  player_id_input uuid,
  player_secret_input text,
  cell_index_input integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room public.game_rooms;
  v_player public.room_players;
  v_other_player public.room_players;
  v_round public.ttt_rounds;
  v_board text[];
  v_symbol text;
  v_winner_symbol text;
  v_winner_player_id uuid;
  v_players_count integer;
begin
  if cell_index_input is null or cell_index_input < 0 or cell_index_input > 8 then
    raise exception 'Casilla invalida.';
  end if;

  select *
  into v_room
  from public.game_rooms
  where code = upper(btrim(room_code_input))
    and game_slug = 'ttt'
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

  select count(*)
  into v_players_count
  from public.room_players
  where room_id = v_room.id;

  if v_players_count < 2 then
    raise exception 'Falta un jugador para empezar.';
  end if;

  select *
  into v_other_player
  from public.room_players
  where room_id = v_room.id
    and id <> v_player.id
  order by joined_at asc
  limit 1;

  select *
  into v_round
  from public.ttt_rounds
  where room_id = v_room.id
  order by round_number desc
  limit 1
  for update;

  if v_round.status <> 'pending' then
    raise exception 'La ronda actual ya esta cerrada.';
  end if;

  if v_round.next_player_id <> v_player.id then
    raise exception 'No es tu turno.';
  end if;

  v_board := v_round.board;

  if coalesce(v_board[cell_index_input + 1], '') <> '' then
    raise exception 'Esa casilla ya esta ocupada.';
  end if;

  if v_round.starting_player_id = v_player.id then
    v_symbol := 'X';
  else
    v_symbol := 'O';
  end if;

  v_board[cell_index_input + 1] := v_symbol;
  v_winner_symbol := public.resolve_ttt_winner(v_board);

  if v_winner_symbol is not null then
    v_winner_player_id := v_player.id;
  else
    v_winner_player_id := null;
  end if;

  update public.ttt_rounds
  set
    board = v_board,
    move_count = v_round.move_count + 1,
    next_player_id = case
      when v_winner_symbol is not null or v_round.move_count + 1 >= 9 then null
      else v_other_player.id
    end,
    status = case
      when v_winner_symbol is not null or v_round.move_count + 1 >= 9 then 'revealed'
      else 'pending'
    end,
    winner_player_id = v_winner_player_id,
    resolved_at = case
      when v_winner_symbol is not null or v_round.move_count + 1 >= 9 then now()
      else null
    end
  where id = v_round.id;

  return jsonb_build_object(
    'ok', true
  );
end;
$$;

create or replace function public.start_next_ttt_round(
  room_code_input text,
  player_id_input uuid,
  player_secret_input text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room public.game_rooms;
  v_player public.room_players;
  v_round public.ttt_rounds;
  v_pending_round public.ttt_rounds;
  v_next_starting_player_id uuid;
begin
  select *
  into v_room
  from public.game_rooms
  where code = upper(btrim(room_code_input))
    and game_slug = 'ttt'
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
  from public.ttt_rounds
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
  from public.ttt_rounds
  where room_id = v_room.id
  order by round_number desc
  limit 1;

  if v_round.status <> 'revealed' then
    raise exception 'La ronda actual todavia no termina.';
  end if;

  select id
  into v_next_starting_player_id
  from public.room_players
  where room_id = v_room.id
    and id <> v_round.starting_player_id
  order by joined_at asc
  limit 1;

  begin
    insert into public.ttt_rounds (
      room_id,
      round_number,
      status,
      starting_player_id,
      next_player_id,
      board,
      move_count
    )
    values (
      v_room.id,
      v_round.round_number + 1,
      'pending',
      v_next_starting_player_id,
      v_next_starting_player_id,
      array['', '', '', '', '', '', '', '', '']::text[],
      0
    )
    returning * into v_pending_round;
  exception
    when unique_violation then
      select *
      into v_pending_round
      from public.ttt_rounds
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

create or replace function public.get_ttt_room_snapshot(room_code_input text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room public.game_rooms;
  v_round public.ttt_rounds;
begin
  select *
  into v_room
  from public.game_rooms
  where code = upper(btrim(room_code_input))
    and game_slug = 'ttt'
  limit 1;

  if not found then
    raise exception 'La sala no existe.';
  end if;

  select *
  into v_round
  from public.ttt_rounds
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
          'joinedAt', p.joined_at,
          'score', (
            select count(*)
            from public.ttt_rounds tr
            where tr.room_id = v_room.id
              and tr.winner_player_id = p.id
          )
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
      'startingPlayerId', v_round.starting_player_id,
      'nextPlayerId', v_round.next_player_id,
      'nextPlayerNickname', (
        select nickname
        from public.room_players
        where id = v_round.next_player_id
      ),
      'winnerPlayerId', v_round.winner_player_id,
      'winnerNickname', (
        select nickname
        from public.room_players
        where id = v_round.winner_player_id
      ),
      'moveCount', v_round.move_count,
      'board', to_jsonb(v_round.board)
    )
  );
end;
$$;

create or replace function public.build_bj_shuffled_deck()
returns text[]
language sql
as $$
  with cards as (
    select rank || suit as card
    from unnest(array['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']) as rank
    cross join unnest(array['S', 'H', 'D', 'C']) as suit
  )
  select coalesce(array_agg(card order by random()), array[]::text[])
  from cards;
$$;

create or replace function public.bj_card_value(card_input text)
returns integer
language plpgsql
immutable
as $$
declare
  v_rank text;
begin
  v_rank := left(card_input, length(card_input) - 1);

  if v_rank = 'A' then
    return 11;
  elsif v_rank in ('K', 'Q', 'J', '10') then
    return 10;
  end if;

  return v_rank::integer;
end;
$$;

create or replace function public.bj_hand_total(cards_input text[])
returns integer
language plpgsql
immutable
as $$
declare
  v_total integer := 0;
  v_aces integer := 0;
  v_card text;
begin
  if cards_input is null then
    return 0;
  end if;

  foreach v_card in array cards_input loop
    v_total := v_total + public.bj_card_value(v_card);

    if left(v_card, length(v_card) - 1) = 'A' then
      v_aces := v_aces + 1;
    end if;
  end loop;

  while v_total > 21 and v_aces > 0 loop
    v_total := v_total - 10;
    v_aces := v_aces - 1;
  end loop;

  return v_total;
end;
$$;

create or replace function public.bj_is_blackjack(cards_input text[])
returns boolean
language sql
immutable
as $$
  select coalesce(array_length(cards_input, 1), 0) = 2
    and public.bj_hand_total(cards_input) = 21;
$$;

create or replace function public.advance_bj_round(round_id_input uuid)
returns void
language plpgsql
set search_path = public, extensions
as $$
declare
  v_round public.bj_rounds;
  v_dealer_cards text[];
  v_dealer_total integer;
begin
  select *
  into v_round
  from public.bj_rounds
  where id = round_id_input
  for update;

  if not found then
    raise exception 'La ronda no existe.';
  end if;

  if public.bj_is_blackjack(v_round.dealer_cards) then
    update public.bj_player_hands
    set
      outcome = case
        when public.bj_hand_total(cards) = 21 then 'push'
        else 'lose'
      end,
      turn_status = case
        when turn_status = 'active' then 'stood'
        else turn_status
      end
    where round_id = v_round.id;

    update public.bj_rounds
    set
      status = 'revealed',
      current_turn_player_id = null,
      dealer_total = public.bj_hand_total(dealer_cards),
      resolved_at = now()
    where id = v_round.id;

    return;
  end if;

  if exists (
    select 1
    from public.bj_player_hands
    where round_id = v_round.id
      and turn_status = 'active'
  ) then
    update public.bj_rounds
    set
      status = 'player_turn',
      current_turn_player_id = null
    where id = v_round.id;

    return;
  end if;

  v_dealer_cards := v_round.dealer_cards;

  update public.bj_rounds
  set
    status = 'dealer_turn',
    current_turn_player_id = null
  where id = v_round.id
  returning * into v_round;

  while public.bj_hand_total(v_dealer_cards) < 17
    and v_round.next_card_index <= coalesce(array_length(v_round.deck, 1), 0) loop
    v_dealer_cards := array_append(v_dealer_cards, v_round.deck[v_round.next_card_index]);

    update public.bj_rounds
    set
      dealer_cards = v_dealer_cards,
      next_card_index = v_round.next_card_index + 1
    where id = v_round.id
    returning * into v_round;
  end loop;

  v_dealer_total := public.bj_hand_total(v_round.dealer_cards);

  update public.bj_player_hands
  set outcome = case
    when turn_status = 'bust' then 'lose'
    when v_dealer_total > 21 then 'win'
    when public.bj_hand_total(cards) > v_dealer_total then 'win'
    when public.bj_hand_total(cards) = v_dealer_total then 'push'
    else 'lose'
  end
  where round_id = v_round.id;

  update public.bj_rounds
  set
    status = 'revealed',
    current_turn_player_id = null,
    dealer_total = v_dealer_total,
    resolved_at = now()
  where id = v_round.id;
end;
$$;

create or replace function public.create_bj_round(
  room_id_input uuid,
  round_number_input integer,
  starting_player_id_input uuid
)
returns uuid
language plpgsql
set search_path = public, extensions
as $$
declare
  v_player_ids uuid[];
  v_player_count integer;
  v_deck text[];
  v_round public.bj_rounds;
  v_idx integer;
  v_player_id uuid;
  v_cards text[];
begin
  select array_agg(id order by case when id = starting_player_id_input then 0 else 1 end, joined_at asc)
  into v_player_ids
  from public.room_players
  where room_id = room_id_input;

  v_player_count := coalesce(array_length(v_player_ids, 1), 0);

  if v_player_count < 2 then
    raise exception 'Se necesitan al menos dos jugadores para repartir.';
  end if;

  if v_player_count > 4 then
    raise exception 'La sala supera el limite de cuatro jugadores.';
  end if;

  if not (starting_player_id_input = any(v_player_ids)) then
    raise exception 'El jugador inicial no pertenece a la sala.';
  end if;

  v_deck := public.build_bj_shuffled_deck();

  insert into public.bj_rounds (
    room_id,
    round_number,
    status,
    starting_player_id,
    current_turn_player_id,
    dealer_cards,
    deck,
    next_card_index
  )
  values (
    room_id_input,
    round_number_input,
    'player_turn',
    starting_player_id_input,
    null,
    array[v_deck[(2 * v_player_count) + 1], v_deck[(2 * v_player_count) + 2]],
    v_deck,
    (2 * v_player_count) + 3
  )
  returning * into v_round;

  for v_idx in 1..v_player_count loop
    v_player_id := v_player_ids[v_idx];
    v_cards := array[v_deck[v_idx], v_deck[v_idx + v_player_count]];

    insert into public.bj_player_hands (
      room_id,
      round_id,
      player_id,
      cards,
      turn_status
    )
    values (
      room_id_input,
      v_round.id,
      v_player_id,
      v_cards,
      case
        when public.bj_is_blackjack(v_cards) then 'blackjack'
        else 'active'
      end
    );
  end loop;

  perform public.advance_bj_round(v_round.id);

  return v_round.id;
end;
$$;

create or replace function public.create_bj_room(host_nickname text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
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
  values (public.generate_room_code(), 'bj')
  returning * into v_room;

  insert into public.room_players (room_id, nickname, is_host, player_secret)
  values (v_room.id, left(btrim(host_nickname), 24), true, v_secret)
  returning * into v_host;

  update public.game_rooms
  set host_player_id = v_host.id
  where id = v_room.id;

  return jsonb_build_object(
    'nickname', v_host.nickname,
    'playerId', v_host.id,
    'playerSecret', v_secret,
    'roomCode', v_room.code,
    'roomId', v_room.id
  );
end;
$$;

create or replace function public.join_bj_room(room_code_input text, player_nickname text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
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
    and game_slug = 'bj'
  limit 1;

  if not found then
    raise exception 'La sala no existe.';
  end if;

  select count(*)
  into v_players_count
  from public.room_players
  where room_id = v_room.id;

  if exists (
    select 1
    from public.bj_rounds
    where room_id = v_room.id
  ) then
    raise exception 'La partida ya empezo. Crea otra sala.';
  end if;

  if v_players_count >= 4 then
    raise exception 'La sala ya esta completa.';
  end if;

  insert into public.room_players (room_id, nickname, is_host, player_secret)
  values (v_room.id, left(btrim(player_nickname), 24), false, v_secret)
  returning * into v_player;

  return jsonb_build_object(
    'nickname', v_player.nickname,
    'playerId', v_player.id,
    'playerSecret', v_secret,
    'roomCode', v_room.code,
    'roomId', v_room.id
  );
end;
$$;

create or replace function public.submit_bj_action(
  room_code_input text,
  player_id_input uuid,
  player_secret_input text,
  action_input text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room public.game_rooms;
  v_player public.room_players;
  v_round public.bj_rounds;
  v_hand public.bj_player_hands;
  v_cards text[];
  v_total integer;
begin
  if action_input not in ('hit', 'stand') then
    raise exception 'Accion invalida.';
  end if;

  select *
  into v_room
  from public.game_rooms
  where code = upper(btrim(room_code_input))
    and game_slug = 'bj'
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
  from public.bj_rounds
  where room_id = v_room.id
  order by round_number desc
  limit 1
  for update;

  if not found then
    raise exception 'La ronda no existe.';
  end if;

  if v_round.status <> 'player_turn' then
    raise exception 'La ronda no acepta acciones ahora mismo.';
  end if;

  select *
  into v_hand
  from public.bj_player_hands
  where round_id = v_round.id
    and player_id = v_player.id
  limit 1
  for update;

  if not found then
    raise exception 'La mano del jugador no existe.';
  end if;

  if v_hand.turn_status <> 'active' then
    raise exception 'Tu mano ya esta cerrada.';
  end if;

  if action_input = 'stand' then
    update public.bj_player_hands
    set turn_status = 'stood'
    where id = v_hand.id;

    perform public.advance_bj_round(v_round.id);

    return jsonb_build_object('ok', true);
  end if;

  if v_round.next_card_index > coalesce(array_length(v_round.deck, 1), 0) then
    raise exception 'No quedan cartas en el mazo.';
  end if;

  v_cards := array_append(v_hand.cards, v_round.deck[v_round.next_card_index]);

  update public.bj_rounds
  set next_card_index = v_round.next_card_index + 1
  where id = v_round.id
  returning * into v_round;

  v_total := public.bj_hand_total(v_cards);

  update public.bj_player_hands
  set
    cards = v_cards,
    turn_status = case
      when v_total > 21 then 'bust'
      when v_total = 21 then 'stood'
      else 'active'
    end
  where id = v_hand.id;

  perform public.advance_bj_round(v_round.id);

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.start_next_bj_round(
  room_code_input text,
  player_id_input uuid,
  player_secret_input text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room public.game_rooms;
  v_player public.room_players;
  v_round public.bj_rounds;
  v_next_starting_player_id uuid;
  v_next_round_id uuid;
  v_players_count integer;
begin
  select *
  into v_room
  from public.game_rooms
  where code = upper(btrim(room_code_input))
    and game_slug = 'bj'
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

  select count(*)
  into v_players_count
  from public.room_players
  where room_id = v_room.id;

  if v_players_count < 2 then
    raise exception 'Se necesitan al menos dos jugadores para repartir.';
  end if;

  select *
  into v_round
  from public.bj_rounds
  where room_id = v_room.id
  order by round_number desc
  limit 1;

  if not found then
    v_next_round_id := public.create_bj_round(v_room.id, 1, v_room.host_player_id);
    update public.game_rooms
    set status = 'playing'
    where id = v_room.id;
    return jsonb_build_object('roundId', v_next_round_id, 'roundNumber', 1);
  end if;

  if v_round.status <> 'revealed' then
    return jsonb_build_object('roundId', v_round.id, 'roundNumber', v_round.round_number);
  end if;

  select id
  into v_next_starting_player_id
  from public.room_players
  where room_id = v_room.id
    and joined_at > (
      select joined_at
      from public.room_players
      where id = v_round.starting_player_id
    )
  order by joined_at asc
  limit 1;

  if v_next_starting_player_id is null then
    select id
    into v_next_starting_player_id
    from public.room_players
    where room_id = v_room.id
    order by joined_at asc
    limit 1;
  end if;

  v_next_round_id := public.create_bj_round(
    v_room.id,
    v_round.round_number + 1,
    v_next_starting_player_id
  );

  return jsonb_build_object(
    'roundId', v_next_round_id,
    'roundNumber', v_round.round_number + 1
  );
end;
$$;

create or replace function public.get_bj_room_snapshot(room_code_input text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room public.game_rooms;
  v_round public.bj_rounds;
begin
  select *
  into v_room
  from public.game_rooms
  where code = upper(btrim(room_code_input))
    and game_slug = 'bj'
  limit 1;

  if not found then
    raise exception 'La sala no existe.';
  end if;

  select *
  into v_round
  from public.bj_rounds
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
          'joinedAt', p.joined_at,
          'score', (
            select count(*)
            from public.bj_player_hands bh
            join public.bj_rounds br on br.id = bh.round_id
            where br.room_id = v_room.id
              and bh.player_id = p.id
              and bh.outcome = 'win'
          )
        )
        order by p.joined_at asc
      )
      from public.room_players p
      where p.room_id = v_room.id
    ), '[]'::jsonb),
    'currentRound', case
      when v_round.id is null then null
      else jsonb_build_object(
        'id', v_round.id,
        'roundNumber', v_round.round_number,
        'status', v_round.status,
        'activePlayerCount', (
          select count(*)
          from public.bj_player_hands
          where round_id = v_round.id
            and turn_status = 'active'
        ),
        'dealerCards', case
          when v_round.status = 'revealed' then to_jsonb(v_round.dealer_cards)
          when coalesce(array_length(v_round.dealer_cards, 1), 0) >= 2 then to_jsonb(array[v_round.dealer_cards[1], '??']::text[])
          else to_jsonb(v_round.dealer_cards)
        end,
        'dealerTotal', case
          when v_round.status = 'revealed' then v_round.dealer_total
          else null
        end,
        'playerHands', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'playerId', p.id,
              'nickname', p.nickname,
              'cards', bh.cards,
              'total', public.bj_hand_total(bh.cards),
              'turnStatus', bh.turn_status,
              'outcome', bh.outcome
            )
            order by case when p.id = v_round.starting_player_id then 0 else 1 end, p.joined_at asc
          )
          from public.bj_player_hands bh
          join public.room_players p on p.id = bh.player_id
          where bh.round_id = v_round.id
        ), '[]'::jsonb)
      )
    end
  );
end;
$$;

create or replace function public.resolve_bjd_round(round_id_input uuid)
returns void
language plpgsql
set search_path = public, extensions
as $$
declare
  v_round public.bjd_rounds;
  v_best_total integer;
  v_winner_count integer;
  v_blackjack_count integer;
begin
  select *
  into v_round
  from public.bjd_rounds
  where id = round_id_input
  for update;

  if not found then
    raise exception 'La ronda no existe.';
  end if;

  select count(*)
  into v_blackjack_count
  from public.bjd_player_hands
  where round_id = v_round.id
    and turn_status = 'blackjack';

  if v_blackjack_count > 0 then
    update public.bjd_player_hands
    set outcome = case
      when turn_status = 'blackjack' and v_blackjack_count = 1 then 'win'
      when turn_status = 'blackjack' and v_blackjack_count > 1 then 'push'
      when v_blackjack_count > 1 then 'push'
      else 'lose'
    end
    where round_id = v_round.id;

    update public.bjd_rounds
    set
      status = 'revealed',
      resolved_at = now()
    where id = v_round.id;

    return;
  end if;

  if exists (
    select 1
    from public.bjd_player_hands
    where round_id = v_round.id
      and turn_status = 'active'
  ) then
    update public.bjd_rounds
    set status = 'pending'
    where id = v_round.id;

    return;
  end if;

  select max(public.bj_hand_total(cards))
  into v_best_total
  from public.bjd_player_hands
  where round_id = v_round.id
    and turn_status <> 'bust';

  if v_best_total is null then
    update public.bjd_player_hands
    set outcome = 'push'
    where round_id = v_round.id;
  else
    select count(*)
    into v_winner_count
    from public.bjd_player_hands
    where round_id = v_round.id
      and turn_status <> 'bust'
      and public.bj_hand_total(cards) = v_best_total;

    update public.bjd_player_hands
    set outcome = case
      when turn_status = 'bust' then 'lose'
      when public.bj_hand_total(cards) = v_best_total and v_winner_count = 1 then 'win'
      when public.bj_hand_total(cards) = v_best_total then 'push'
      else 'lose'
    end
    where round_id = v_round.id;
  end if;

  update public.bjd_rounds
  set
    status = 'revealed',
    resolved_at = now()
  where id = v_round.id;
end;
$$;

create or replace function public.create_bjd_round(
  room_id_input uuid,
  round_number_input integer
)
returns uuid
language plpgsql
set search_path = public, extensions
as $$
declare
  v_player_ids uuid[];
  v_deck text[];
  v_round public.bjd_rounds;
  v_cards text[];
  v_idx integer;
begin
  select array_agg(id order by joined_at asc)
  into v_player_ids
  from public.room_players
  where room_id = room_id_input;

  if coalesce(array_length(v_player_ids, 1), 0) <> 2 then
    raise exception 'Se necesitan dos jugadores para repartir.';
  end if;

  v_deck := public.build_bj_shuffled_deck();

  insert into public.bjd_rounds (
    room_id,
    round_number,
    status,
    deck,
    next_card_index
  )
  values (
    room_id_input,
    round_number_input,
    'pending',
    v_deck,
    5
  )
  returning * into v_round;

  for v_idx in 1..2 loop
    v_cards := array[v_deck[v_idx], v_deck[v_idx + 2]];

    insert into public.bjd_player_hands (
      room_id,
      round_id,
      player_id,
      cards,
      turn_status
    )
    values (
      room_id_input,
      v_round.id,
      v_player_ids[v_idx],
      v_cards,
      case
        when public.bj_is_blackjack(v_cards) then 'blackjack'
        else 'active'
      end
    );
  end loop;

  perform public.resolve_bjd_round(v_round.id);

  return v_round.id;
end;
$$;

create or replace function public.create_bjd_room(host_nickname text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
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
  values (public.generate_room_code(), 'bjd')
  returning * into v_room;

  insert into public.room_players (room_id, nickname, is_host, player_secret)
  values (v_room.id, left(btrim(host_nickname), 24), true, v_secret)
  returning * into v_host;

  update public.game_rooms
  set host_player_id = v_host.id
  where id = v_room.id;

  return jsonb_build_object(
    'nickname', v_host.nickname,
    'playerId', v_host.id,
    'playerSecret', v_secret,
    'roomCode', v_room.code,
    'roomId', v_room.id
  );
end;
$$;

create or replace function public.join_bjd_room(room_code_input text, player_nickname text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
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
    and game_slug = 'bjd'
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

  perform public.create_bjd_round(v_room.id, 1);

  return jsonb_build_object(
    'nickname', v_player.nickname,
    'playerId', v_player.id,
    'playerSecret', v_secret,
    'roomCode', v_room.code,
    'roomId', v_room.id
  );
end;
$$;

create or replace function public.submit_bjd_action(
  room_code_input text,
  player_id_input uuid,
  player_secret_input text,
  action_input text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room public.game_rooms;
  v_player public.room_players;
  v_round public.bjd_rounds;
  v_hand public.bjd_player_hands;
  v_cards text[];
  v_total integer;
begin
  if action_input not in ('hit', 'stand') then
    raise exception 'Accion invalida.';
  end if;

  select *
  into v_room
  from public.game_rooms
  where code = upper(btrim(room_code_input))
    and game_slug = 'bjd'
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
  from public.bjd_rounds
  where room_id = v_room.id
  order by round_number desc
  limit 1
  for update;

  if not found then
    raise exception 'La ronda no existe.';
  end if;

  if v_round.status <> 'pending' then
    raise exception 'La ronda no acepta acciones ahora mismo.';
  end if;

  select *
  into v_hand
  from public.bjd_player_hands
  where round_id = v_round.id
    and player_id = v_player.id
  limit 1
  for update;

  if not found then
    raise exception 'La mano del jugador no existe.';
  end if;

  if v_hand.turn_status <> 'active' then
    raise exception 'Tu mano ya esta cerrada.';
  end if;

  if action_input = 'stand' then
    update public.bjd_player_hands
    set turn_status = 'stood'
    where id = v_hand.id;

    perform public.resolve_bjd_round(v_round.id);

    return jsonb_build_object('ok', true);
  end if;

  if v_round.next_card_index > coalesce(array_length(v_round.deck, 1), 0) then
    raise exception 'No quedan cartas en el mazo.';
  end if;

  v_cards := array_append(v_hand.cards, v_round.deck[v_round.next_card_index]);

  update public.bjd_rounds
  set next_card_index = v_round.next_card_index + 1
  where id = v_round.id
  returning * into v_round;

  v_total := public.bj_hand_total(v_cards);

  update public.bjd_player_hands
  set
    cards = v_cards,
    turn_status = case
      when v_total > 21 then 'bust'
      when v_total = 21 then 'stood'
      else 'active'
    end
  where id = v_hand.id;

  perform public.resolve_bjd_round(v_round.id);

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.start_next_bjd_round(
  room_code_input text,
  player_id_input uuid,
  player_secret_input text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room public.game_rooms;
  v_player public.room_players;
  v_round public.bjd_rounds;
  v_players_count integer;
  v_next_round_id uuid;
begin
  select *
  into v_room
  from public.game_rooms
  where code = upper(btrim(room_code_input))
    and game_slug = 'bjd'
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

  select count(*)
  into v_players_count
  from public.room_players
  where room_id = v_room.id;

  if v_players_count < 2 then
    raise exception 'Se necesitan dos jugadores para empezar.';
  end if;

  select *
  into v_round
  from public.bjd_rounds
  where room_id = v_room.id
  order by round_number desc
  limit 1;

  if not found then
    v_next_round_id := public.create_bjd_round(v_room.id, 1);
    return jsonb_build_object('roundId', v_next_round_id, 'roundNumber', 1);
  end if;

  if v_round.status <> 'revealed' then
    return jsonb_build_object('roundId', v_round.id, 'roundNumber', v_round.round_number);
  end if;

  v_next_round_id := public.create_bjd_round(v_room.id, v_round.round_number + 1);

  return jsonb_build_object(
    'roundId', v_next_round_id,
    'roundNumber', v_round.round_number + 1
  );
end;
$$;

create or replace function public.get_bjd_room_snapshot(
  room_code_input text,
  player_id_input uuid,
  player_secret_input text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room public.game_rooms;
  v_player public.room_players;
  v_round public.bjd_rounds;
begin
  select *
  into v_room
  from public.game_rooms
  where code = upper(btrim(room_code_input))
    and game_slug = 'bjd'
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
  from public.bjd_rounds
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
          'joinedAt', p.joined_at,
          'score', (
            select count(*)
            from public.bjd_player_hands dh
            join public.bjd_rounds dr on dr.id = dh.round_id
            where dr.room_id = v_room.id
              and dh.player_id = p.id
              and dh.outcome = 'win'
          )
        )
        order by p.joined_at asc
      )
      from public.room_players p
      where p.room_id = v_room.id
    ), '[]'::jsonb),
    'currentRound', case
      when v_round.id is null then null
      else jsonb_build_object(
        'id', v_round.id,
        'roundNumber', v_round.round_number,
        'status', v_round.status,
        'activePlayerCount', (
          select count(*)
          from public.bjd_player_hands
          where round_id = v_round.id
            and turn_status = 'active'
        ),
        'playerHands', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'playerId', p.id,
              'nickname', p.nickname,
              'isSelf', p.id = v_player.id,
              'revealed', p.id = v_player.id or v_round.status = 'revealed',
              'cardCount', coalesce(array_length(h.cards, 1), 0),
              'cards', case
                when p.id = v_player.id or v_round.status = 'revealed' then h.cards
                else array(
                  select '??'::text
                  from generate_series(1, coalesce(array_length(h.cards, 1), 0))
                )
              end,
              'total', case
                when p.id = v_player.id or v_round.status = 'revealed' then public.bj_hand_total(h.cards)
                else null
              end,
              'turnStatus', h.turn_status,
              'outcome', h.outcome
            )
            order by case when p.id = v_player.id then 0 else 1 end, p.joined_at asc
          )
          from public.bjd_player_hands h
          join public.room_players p on p.id = h.player_id
          where h.round_id = v_round.id
        ), '[]'::jsonb)
      )
    end
  );
end;
$$;

alter table public.game_rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.rps_rounds enable row level security;
alter table public.rps_moves enable row level security;
alter table public.ttt_rounds enable row level security;
alter table public.bj_rounds enable row level security;
alter table public.bj_player_hands enable row level security;
alter table public.bjd_rounds enable row level security;
alter table public.bjd_player_hands enable row level security;

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

drop policy if exists "public read ttt rounds" on public.ttt_rounds;
create policy "public read ttt rounds"
on public.ttt_rounds
for select
using (true);

drop policy if exists "public read bj rounds" on public.bj_rounds;
create policy "public read bj rounds"
on public.bj_rounds
for select
using (true);

drop policy if exists "public read bj hands" on public.bj_player_hands;
create policy "public read bj hands"
on public.bj_player_hands
for select
using (true);

drop policy if exists "public read bjd rounds" on public.bjd_rounds;
drop policy if exists "public read bjd hands" on public.bjd_player_hands;

grant select on public.game_rooms to anon, authenticated;
grant select on public.room_players to anon, authenticated;
grant select on public.rps_rounds to anon, authenticated;
grant select on public.ttt_rounds to anon, authenticated;
grant select on public.bj_rounds to anon, authenticated;
grant select on public.bj_player_hands to anon, authenticated;
revoke all on public.rps_moves from anon, authenticated;
revoke all on public.bjd_rounds from anon, authenticated;
revoke all on public.bjd_player_hands from anon, authenticated;

revoke all on function public.create_rps_room(text) from public;
revoke all on function public.join_rps_room(text, text) from public;
revoke all on function public.submit_rps_move(text, uuid, text, text) from public;
revoke all on function public.start_next_rps_round(text, uuid, text) from public;
revoke all on function public.get_rps_room_snapshot(text) from public;
revoke all on function public.create_ttt_room(text) from public;
revoke all on function public.join_ttt_room(text, text) from public;
revoke all on function public.submit_ttt_move(text, uuid, text, integer) from public;
revoke all on function public.start_next_ttt_round(text, uuid, text) from public;
revoke all on function public.get_ttt_room_snapshot(text) from public;
revoke all on function public.create_bj_room(text) from public;
revoke all on function public.join_bj_room(text, text) from public;
revoke all on function public.submit_bj_action(text, uuid, text, text) from public;
revoke all on function public.start_next_bj_round(text, uuid, text) from public;
revoke all on function public.get_bj_room_snapshot(text) from public;
revoke all on function public.create_bjd_room(text) from public;
revoke all on function public.join_bjd_room(text, text) from public;
revoke all on function public.submit_bjd_action(text, uuid, text, text) from public;
revoke all on function public.start_next_bjd_round(text, uuid, text) from public;
revoke all on function public.get_bjd_room_snapshot(text, uuid, text) from public;

grant execute on function public.create_rps_room(text) to anon, authenticated;
grant execute on function public.join_rps_room(text, text) to anon, authenticated;
grant execute on function public.submit_rps_move(text, uuid, text, text) to anon, authenticated;
grant execute on function public.start_next_rps_round(text, uuid, text) to anon, authenticated;
grant execute on function public.get_rps_room_snapshot(text) to anon, authenticated;
grant execute on function public.create_ttt_room(text) to anon, authenticated;
grant execute on function public.join_ttt_room(text, text) to anon, authenticated;
grant execute on function public.submit_ttt_move(text, uuid, text, integer) to anon, authenticated;
grant execute on function public.start_next_ttt_round(text, uuid, text) to anon, authenticated;
grant execute on function public.get_ttt_room_snapshot(text) to anon, authenticated;
grant execute on function public.create_bj_room(text) to anon, authenticated;
grant execute on function public.join_bj_room(text, text) to anon, authenticated;
grant execute on function public.submit_bj_action(text, uuid, text, text) to anon, authenticated;
grant execute on function public.start_next_bj_round(text, uuid, text) to anon, authenticated;
grant execute on function public.get_bj_room_snapshot(text) to anon, authenticated;
grant execute on function public.create_bjd_room(text) to anon, authenticated;
grant execute on function public.join_bjd_room(text, text) to anon, authenticated;
grant execute on function public.submit_bjd_action(text, uuid, text, text) to anon, authenticated;
grant execute on function public.start_next_bjd_round(text, uuid, text) to anon, authenticated;
grant execute on function public.get_bjd_room_snapshot(text, uuid, text) to anon, authenticated;

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
      and cls.relname = 'ttt_rounds'
  ) then
    alter publication supabase_realtime add table public.ttt_rounds;
  end if;

  if not exists (
    select 1
    from pg_publication_rel rel
    join pg_class cls on cls.oid = rel.prrelid
    join pg_publication pub on pub.oid = rel.prpubid
    where pub.pubname = 'supabase_realtime'
      and cls.relname = 'bj_rounds'
  ) then
    alter publication supabase_realtime add table public.bj_rounds;
  end if;

  if not exists (
    select 1
    from pg_publication_rel rel
    join pg_class cls on cls.oid = rel.prrelid
    join pg_publication pub on pub.oid = rel.prpubid
    where pub.pubname = 'supabase_realtime'
      and cls.relname = 'bj_player_hands'
  ) then
    alter publication supabase_realtime add table public.bj_player_hands;
  end if;

end $$;
