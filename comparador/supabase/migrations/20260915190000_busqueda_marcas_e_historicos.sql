create or replace function public.buscar_ids_productos_supermercado(
  p_consulta text,
  p_cadenas uuid[] default null,
  p_limite integer default 120
)
returns table (producto_supermercado_id uuid)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select referencia.id
  from public.productos_supermercado as referencia
  where referencia.activo = true
    and (
      p_cadenas is null
      or cardinality(p_cadenas) = 0
      or referencia.cadena_supermercado_id = any(p_cadenas)
    )
    and (
      extensions.unaccent(lower(concat_ws(' ', referencia.marca_original, referencia.nombre_original))) like
        '%' || extensions.unaccent(lower(trim(p_consulta))) || '%'
      or regexp_replace(
        extensions.unaccent(lower(concat_ws(' ', referencia.marca_original, referencia.nombre_original))),
        '[^[:alnum:]]+',
        '',
        'g'
      ) like '%' || regexp_replace(
        extensions.unaccent(lower(trim(p_consulta))),
        '[^[:alnum:]]+',
        '',
        'g'
      ) || '%'
    )
  order by referencia.fecha_ultima_deteccion desc nulls last,
           referencia.nombre_original
  limit least(greatest(coalesce(p_limite, 120), 1), 500);
$$;

revoke all on function public.buscar_ids_productos_supermercado(
  text,
  uuid[],
  integer
) from public, anon, authenticated;
grant execute on function public.buscar_ids_productos_supermercado(
  text,
  uuid[],
  integer
) to service_role;

comment on function public.buscar_ids_productos_supermercado(
  text,
  uuid[],
  integer
) is
  'Localiza referencias activas por marca y nombre, ignorando tildes, mayúsculas y separadores internos.';

insert into public.terminos_rastreo (
  termino,
  termino_normalizado,
  supermercados,
  prioridad,
  activo
)
values (
  'garofalo mezzelune',
  'garofalo mezzelune',
  array['primaprix'],
  100,
  true
)
on conflict (termino_normalizado) do update
set termino = excluded.termino,
    supermercados = array(
      select distinct supermercado
      from unnest(
        public.terminos_rastreo.supermercados || excluded.supermercados
      ) as supermercado
      order by supermercado
    ),
    activo = true,
    updated_at = now();
