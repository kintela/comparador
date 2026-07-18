create or replace function public.promover_solicitud_completada_a_termino()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supermercados text[];
begin
  if old.estado is distinct from 'completada'
     and new.estado = 'completada'
     and coalesce((new.detalles_resultado ->> 'automatico')::boolean, false)
     and jsonb_typeof(new.detalles_resultado -> 'supermercados_objetivo') = 'array'
  then
    select coalesce(array_agg(distinct supermercado order by supermercado), '{}')
    into v_supermercados
    from jsonb_array_elements_text(
      new.detalles_resultado -> 'supermercados_objetivo'
    ) as supermercado;

    insert into public.terminos_rastreo (
      termino,
      termino_normalizado,
      supermercados,
      prioridad,
      activo,
      updated_at
    )
    values (
      new.termino_original,
      new.termino_normalizado,
      v_supermercados,
      300,
      true,
      now()
    )
    on conflict (termino_normalizado) do update
      set termino = excluded.termino,
          supermercados = case
            when cardinality(public.terminos_rastreo.supermercados) = 0
              or cardinality(excluded.supermercados) = 0
            then '{}'
            else array(
              select distinct slug
              from unnest(
                public.terminos_rastreo.supermercados ||
                excluded.supermercados
              ) as slug
              where slug <> ''
              order by slug
            )
          end,
          activo = true,
          updated_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists promover_solicitud_completada_a_termino
  on public.solicitudes_rastreo;
create trigger promover_solicitud_completada_a_termino
after update of estado on public.solicitudes_rastreo
for each row
execute function public.promover_solicitud_completada_a_termino();

comment on function public.promover_solicitud_completada_a_termino() is
  'Conserva como término periódico cada solicitud automática que encontró productos.';
