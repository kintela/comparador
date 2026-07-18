-- Una actualización de Eroski podía sustituir producto_id al hacer upsert y
-- dejar atrás el producto normalizado anterior. Conservamos únicamente
-- referencias que tengan algún precio y productos vinculados a ellas.

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
