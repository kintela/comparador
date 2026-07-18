-- El catálogo normalizado solo conserva productos que hayan tenido al menos
-- un precio. Primero se eliminan las referencias de supermercado que nunca
-- recibieron precio y después los productos que hayan quedado huérfanos.

delete from public.productos_supermercado as producto_supermercado
where not exists (
  select 1
  from public.precios as precio
  where precio.producto_supermercado_id = producto_supermercado.id
);

delete from public.productos as producto
where not exists (
  select 1
  from public.productos_supermercado as producto_supermercado
  where producto_supermercado.producto_id = producto.id
);

create or replace function public.contar_productos_sin_precio()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)
  from public.productos as producto
  where not exists (
    select 1
    from public.productos_supermercado as producto_supermercado
    inner join public.precios as precio
      on precio.producto_supermercado_id = producto_supermercado.id
    where producto_supermercado.producto_id = producto.id
  );
$$;

revoke all on function public.contar_productos_sin_precio()
  from public, anon, authenticated;
grant execute on function public.contar_productos_sin_precio()
  to service_role;

comment on function public.contar_productos_sin_precio() is
  'Cuenta productos normalizados sin ningún precio histórico asociado.';
