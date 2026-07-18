create table if not exists public.solicitudes_rastreo_progreso (
  solicitud_rastreo_id uuid not null
    references public.solicitudes_rastreo(id) on delete cascade,
  supermercado text not null,
  estado text not null
    check (estado in ('completado', 'error')),
  productos_encontrados integer not null default 0
    check (productos_encontrados >= 0),
  mensaje_error text,
  fecha_procesado timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (solicitud_rastreo_id, supermercado)
);

create index if not exists solicitudes_rastreo_progreso_estado_idx
  on public.solicitudes_rastreo_progreso (supermercado, estado);

alter table public.solicitudes_rastreo_progreso enable row level security;

create or replace function public.registrar_resultado_solicitud_automatica(
  p_solicitud_id uuid,
  p_supermercado text,
  p_supermercados_objetivo text[],
  p_productos_encontrados integer,
  p_mensaje_error text default null
)
returns table (
  estado_actual text,
  productos_totales integer,
  supermercados_completados integer,
  supermercados_totales integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_objetivos text[];
  v_completados integer;
  v_productos integer;
  v_estado text;
begin
  v_objetivos := array(
    select distinct slug
    from unnest(coalesce(p_supermercados_objetivo, '{}')) as slug
    where slug <> ''
    order by slug
  );

  if cardinality(v_objetivos) = 0 or not (p_supermercado = any(v_objetivos)) then
    raise exception 'Supermercados objetivo no válidos';
  end if;

  insert into public.solicitudes_rastreo_progreso (
    solicitud_rastreo_id,
    supermercado,
    estado,
    productos_encontrados,
    mensaje_error,
    fecha_procesado,
    updated_at
  )
  values (
    p_solicitud_id,
    p_supermercado,
    case when p_mensaje_error is null then 'completado' else 'error' end,
    greatest(coalesce(p_productos_encontrados, 0), 0),
    p_mensaje_error,
    now(),
    now()
  )
  on conflict (solicitud_rastreo_id, supermercado) do update
    set estado = excluded.estado,
        productos_encontrados = excluded.productos_encontrados,
        mensaje_error = excluded.mensaje_error,
        fecha_procesado = now(),
        updated_at = now();

  select
    count(*) filter (where progreso.estado = 'completado')::integer,
    coalesce(
      sum(progreso.productos_encontrados)
        filter (where progreso.estado = 'completado'),
      0
    )::integer
  into v_completados, v_productos
  from public.solicitudes_rastreo_progreso as progreso
  where progreso.solicitud_rastreo_id = p_solicitud_id
    and progreso.supermercado = any(v_objetivos);

  v_estado := case
    when v_completados < cardinality(v_objetivos) then 'procesando'
    when v_productos > 0 then 'completada'
    else 'sin_resultados'
  end;

  update public.solicitudes_rastreo
  set estado = v_estado,
      productos_encontrados = v_productos,
      detalles_resultado = jsonb_build_object(
        'automatico', true,
        'supermercados_objetivo', v_objetivos,
        'supermercados_completados', v_completados
      ),
      fecha_procesado = case
        when v_estado in ('completada', 'sin_resultados') then now()
        else null
      end,
      updated_at = now()
  where id = p_solicitud_id;

  return query
  select
    v_estado,
    v_productos,
    v_completados,
    cardinality(v_objetivos);
end;
$$;

revoke all on function public.registrar_resultado_solicitud_automatica(
  uuid,
  text,
  text[],
  integer,
  text
) from public, anon, authenticated;
grant execute on function public.registrar_resultado_solicitud_automatica(
  uuid,
  text,
  text[],
  integer,
  text
) to service_role;

create or replace function public.limpiar_progreso_solicitud_reactivada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.estado in ('completada', 'sin_resultados', 'descartada')
     and new.estado = 'pendiente' then
    delete from public.solicitudes_rastreo_progreso
    where solicitud_rastreo_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists limpiar_progreso_solicitud_reactivada
  on public.solicitudes_rastreo;
create trigger limpiar_progreso_solicitud_reactivada
after update of estado on public.solicitudes_rastreo
for each row
execute function public.limpiar_progreso_solicitud_reactivada();

comment on table public.solicitudes_rastreo_progreso is
  'Seguimiento por supermercado de las solicitudes incorporadas a los cron.';
