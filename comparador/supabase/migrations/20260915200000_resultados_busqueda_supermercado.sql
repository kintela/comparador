create table if not exists public.productos_supermercado_busquedas (
  producto_supermercado_id uuid not null
    references public.productos_supermercado(id) on delete cascade,
  termino_normalizado text not null,
  fecha_ultima_coincidencia timestamptz not null default now(),
  primary key (producto_supermercado_id, termino_normalizado)
);

create index if not exists productos_supermercado_busquedas_termino_idx
  on public.productos_supermercado_busquedas (
    termino_normalizado,
    fecha_ultima_coincidencia desc
  );

alter table public.productos_supermercado_busquedas enable row level security;

insert into public.productos_supermercado_busquedas (
  producto_supermercado_id,
  termino_normalizado,
  fecha_ultima_coincidencia
)
select
  referencia.id,
  'vaina',
  coalesce(referencia.fecha_ultima_deteccion, now())
from public.productos_supermercado as referencia
inner join public.cadenas_supermercados as cadena
  on cadena.id = referencia.cadena_supermercado_id
where cadena.slug = 'bm-supermercados'
  and referencia.identificador_externo = any(array[
    '1499',
    '78955',
    '78954',
    '67473',
    '10675',
    '17316',
    '62293',
    '10730',
    '23495',
    '61593',
    '828',
    '15648'
  ])
on conflict (producto_supermercado_id, termino_normalizado) do update
set fecha_ultima_coincidencia = excluded.fecha_ultima_coincidencia;

comment on table public.productos_supermercado_busquedas is
  'Conserva qué referencias devolvió el buscador de origen para consultas cuya relación no aparece literalmente en el nombre.';
