create table if not exists public.informes_rastreo_enviados (
  fecha date primary key,
  destinatario text not null,
  message_id text,
  ejecuciones_incluidas integer not null default 0
    check (ejecuciones_incluidas >= 0),
  created_at timestamptz not null default now()
);

alter table public.informes_rastreo_enviados enable row level security;

comment on table public.informes_rastreo_enviados is
  'Control de idempotencia de los informes diarios de rastreos enviados por correo.';
