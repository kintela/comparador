insert into public.terminos_rastreo (
  termino,
  termino_normalizado,
  prioridad,
  activo
)
values ('vino blanco', 'vino blanco', 260, true)
on conflict (termino_normalizado) do update
set
  termino = excluded.termino,
  prioridad = excluded.prioridad,
  activo = true,
  updated_at = now();
