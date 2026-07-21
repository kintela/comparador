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
        supermercados_solicitados = case
          when solicitudes_rastreo.estado in (
            'completada',
            'sin_resultados',
            'descartada'
          )
          then excluded.supermercados_solicitados
          else array(
            select distinct supermercado
            from unnest(
              solicitudes_rastreo.supermercados_solicitados ||
              excluded.supermercados_solicitados
            ) as supermercado
            where supermercado <> ''
            order by supermercado
          )
        end,
        estado = case
          when solicitudes_rastreo.estado = 'procesando' then 'procesando'
          else 'pendiente'
        end,
        productos_encontrados = case
          when solicitudes_rastreo.estado = 'procesando'
            then solicitudes_rastreo.productos_encontrados
          else null
        end,
        detalles_resultado = case
          when solicitudes_rastreo.estado = 'procesando'
            then solicitudes_rastreo.detalles_resultado
          else null
        end,
        fecha_procesado = case
          when solicitudes_rastreo.estado = 'procesando'
            then solicitudes_rastreo.fecha_procesado
          else null
        end,
        fecha_ultima_solicitud = now(),
        updated_at = now()
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

revoke all on function public.registrar_solicitud_rastreo(
  text,
  text,
  text[],
  text
) from public, anon, authenticated;
grant execute on function public.registrar_solicitud_rastreo(
  text,
  text,
  text[],
  text
) to service_role;

comment on function public.registrar_solicitud_rastreo(
  text,
  text,
  text[],
  text
) is
  'Registra demanda anónima y conserva únicamente la cobertura pendiente al reabrir una solicitud completada.';
