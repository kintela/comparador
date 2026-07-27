create table if not exists public.informes_ofertas_enviados (
  fecha date primary key,
  destinatario text not null,
  message_id text,
  ofertas_incluidas integer not null default 0
    check (ofertas_incluidas >= 0),
  created_at timestamptz not null default now()
);

alter table public.informes_ofertas_enviados enable row level security;

comment on table public.informes_ofertas_enviados is
  'Control de idempotencia de los correos diarios de ofertas enviados.';
