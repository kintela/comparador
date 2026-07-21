create extension if not exists unaccent with schema extensions;

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
    and extensions.unaccent(lower(referencia.nombre_original)) like
      '%' || extensions.unaccent(lower(trim(p_consulta))) || '%'
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
  'Localiza referencias activas ignorando tildes y mayúsculas.';
