create extension if not exists pgcrypto;

create table if not exists public.bloqueos_rastreo (
  clave text primary key,
  token uuid not null,
  bloqueado_hasta timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.bloqueos_rastreo enable row level security;

create or replace function public.adquirir_bloqueo_rastreo(
  p_clave text,
  p_token uuid,
  p_duracion_segundos integer default 900
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_adquirido boolean;
begin
  if p_clave is null or btrim(p_clave) = '' then
    raise exception 'La clave del bloqueo no puede estar vacía';
  end if;

  if p_duracion_segundos < 60 or p_duracion_segundos > 3600 then
    raise exception 'La duración del bloqueo debe estar entre 60 y 3600 segundos';
  end if;

  insert into public.bloqueos_rastreo (
    clave,
    token,
    bloqueado_hasta,
    updated_at
  )
  values (
    p_clave,
    p_token,
    now() + make_interval(secs => p_duracion_segundos),
    now()
  )
  on conflict (clave) do update
    set token = excluded.token,
        bloqueado_hasta = excluded.bloqueado_hasta,
        updated_at = now()
    where bloqueos_rastreo.bloqueado_hasta <= now()
  returning true into v_adquirido;

  return coalesce(v_adquirido, false);
end;
$$;

create or replace function public.liberar_bloqueo_rastreo(
  p_clave text,
  p_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_filas integer;
begin
  delete from public.bloqueos_rastreo
   where clave = p_clave
     and token = p_token;

  get diagnostics v_filas = row_count;
  return v_filas > 0;
end;
$$;

revoke all on function public.adquirir_bloqueo_rastreo(text, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.liberar_bloqueo_rastreo(text, uuid)
  from public, anon, authenticated;
grant execute on function public.adquirir_bloqueo_rastreo(text, uuid, integer)
  to service_role;
grant execute on function public.liberar_bloqueo_rastreo(text, uuid)
  to service_role;

comment on table public.bloqueos_rastreo is
  'Bloqueos temporales para impedir rastreos simultáneos de un mismo supermercado.';
