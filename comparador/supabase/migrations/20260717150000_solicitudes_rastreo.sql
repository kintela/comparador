create extension if not exists pgcrypto;

create table if not exists public.solicitudes_rastreo (
  id uuid primary key default gen_random_uuid(),
  termino_original text not null,
  termino_normalizado text not null unique,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'procesando', 'completada', 'sin_resultados', 'descartada')),
  total_solicitudes integer not null default 0 check (total_solicitudes >= 0),
  supermercados_solicitados text[] not null default '{}',
  productos_encontrados integer check (productos_encontrados is null or productos_encontrados >= 0),
  detalles_resultado jsonb,
  fecha_primera_solicitud timestamptz not null default now(),
  fecha_ultima_solicitud timestamptz not null default now(),
  fecha_procesado timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.solicitudes_rastreo_eventos (
  id bigint generated always as identity primary key,
  solicitud_rastreo_id uuid not null
    references public.solicitudes_rastreo(id) on delete cascade,
  solicitante_hash text not null,
  fecha date not null default current_date,
  created_at timestamptz not null default now(),
  unique (solicitud_rastreo_id, solicitante_hash, fecha)
);

create index if not exists solicitudes_rastreo_prioridad_idx
  on public.solicitudes_rastreo (estado, total_solicitudes desc, fecha_ultima_solicitud desc);
create index if not exists solicitudes_rastreo_eventos_fecha_idx
  on public.solicitudes_rastreo_eventos (fecha);

alter table public.solicitudes_rastreo enable row level security;
alter table public.solicitudes_rastreo_eventos enable row level security;

create or replace function public.registrar_solicitud_rastreo(
  p_termino_original text,
  p_termino_normalizado text,
  p_supermercados text[],
  p_solicitante_hash text
)
returns table (
  solicitud_id uuid,
  solicitudes integer,
  estado_actual text,
  contabilizada boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_solicitud public.solicitudes_rastreo%rowtype;
  v_evento_id bigint;
begin
  delete from public.solicitudes_rastreo_eventos
   where fecha < current_date - 31;

  insert into public.solicitudes_rastreo (
    termino_original,
    termino_normalizado,
    supermercados_solicitados
  )
  values (
    p_termino_original,
    p_termino_normalizado,
    coalesce(p_supermercados, '{}')
  )
  on conflict (termino_normalizado) do update
    set termino_original = excluded.termino_original,
        estado = case
          when solicitudes_rastreo.estado = 'procesando' then 'procesando'
          else 'pendiente'
        end,
        fecha_procesado = case
          when solicitudes_rastreo.estado = 'procesando'
            then solicitudes_rastreo.fecha_procesado
          else null
        end,
        fecha_ultima_solicitud = now(),
        updated_at = now()
  returning * into v_solicitud;

  update public.solicitudes_rastreo
     set supermercados_solicitados = array(
       select distinct supermercado
         from unnest(
           v_solicitud.supermercados_solicitados ||
           coalesce(p_supermercados, '{}')
         ) as supermercado
        where supermercado <> ''
        order by supermercado
     )
   where id = v_solicitud.id
   returning * into v_solicitud;

  insert into public.solicitudes_rastreo_eventos (
    solicitud_rastreo_id,
    solicitante_hash
  )
  values (v_solicitud.id, p_solicitante_hash)
  on conflict (solicitud_rastreo_id, solicitante_hash, fecha) do nothing
  returning id into v_evento_id;

  if v_evento_id is not null then
    update public.solicitudes_rastreo
       set total_solicitudes = total_solicitudes + 1,
           fecha_ultima_solicitud = now(),
           updated_at = now()
     where id = v_solicitud.id
     returning * into v_solicitud;
  end if;

  return query
  select
    v_solicitud.id,
    v_solicitud.total_solicitudes,
    v_solicitud.estado,
    v_evento_id is not null;
end;
$$;

revoke all on function public.registrar_solicitud_rastreo(text, text, text[], text)
  from public, anon, authenticated;
grant execute on function public.registrar_solicitud_rastreo(text, text, text[], text)
  to service_role;

comment on table public.solicitudes_rastreo is
  'Cola agregada de productos solicitados por usuarios y todavía no encontrados.';
comment on table public.solicitudes_rastreo_eventos is
  'Control antiabuso: contabiliza como máximo una solicitud anonimizada por término y día.';
