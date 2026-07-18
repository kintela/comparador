-- El catálogo solo admite productos respaldados por una referencia con precio.
-- Estos triggers eliminan automáticamente los restos que puedan producirse al
-- borrar el último precio o al cambiar/eliminar el vínculo de una referencia.

create or replace function public.eliminar_producto_desvinculado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.producto_id is not null
     and (
       tg_op = 'DELETE'
       or new.producto_id is distinct from old.producto_id
     ) then
    delete from public.productos as producto
    where producto.id = old.producto_id
      and not exists (
        select 1
        from public.productos_supermercado as referencia
        where referencia.producto_id = producto.id
      );
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists productos_supermercado_eliminar_huerfano
  on public.productos_supermercado;
create trigger productos_supermercado_eliminar_huerfano
after update of producto_id or delete
on public.productos_supermercado
for each row
execute function public.eliminar_producto_desvinculado();

create or replace function public.eliminar_referencia_sin_precios()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.precios as precio
    where precio.producto_supermercado_id = old.producto_supermercado_id
  ) then
    delete from public.productos_supermercado
    where id = old.producto_supermercado_id;
  end if;

  return old;
end;
$$;

drop trigger if exists precios_eliminar_referencia_huerfana
  on public.precios;
create trigger precios_eliminar_referencia_huerfana
after delete or update of producto_supermercado_id
on public.precios
for each row
execute function public.eliminar_referencia_sin_precios();

revoke all on function public.eliminar_producto_desvinculado() from public;
revoke all on function public.eliminar_referencia_sin_precios() from public;
