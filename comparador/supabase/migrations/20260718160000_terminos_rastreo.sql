create extension if not exists pgcrypto;

create table if not exists public.terminos_rastreo (
  id uuid primary key default gen_random_uuid(),
  termino text not null,
  termino_normalizado text not null unique,
  supermercados text[] not null default '{}',
  prioridad integer not null default 100 check (prioridad >= 0),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists terminos_rastreo_activos_idx
  on public.terminos_rastreo (activo, prioridad, termino);

alter table public.terminos_rastreo enable row level security;

insert into public.terminos_rastreo (
  termino,
  termino_normalizado,
  prioridad
)
values
  ('leche', 'leche', 10),
  ('huevos', 'huevos', 20),
  ('pan', 'pan', 30),
  ('arroz', 'arroz', 40),
  ('pasta', 'pasta', 50),
  ('aceite', 'aceite', 60),
  ('harina', 'harina', 70),
  ('azúcar', 'azucar', 80),
  ('café', 'cafe', 90),
  ('agua', 'agua', 100),
  ('yogur', 'yogur', 110),
  ('queso', 'queso', 120),
  ('mantequilla', 'mantequilla', 130),
  ('pollo', 'pollo', 140),
  ('carne', 'carne', 150),
  ('pescado', 'pescado', 160),
  ('verduras', 'verduras', 170),
  ('fruta', 'fruta', 180),
  ('legumbres', 'legumbres', 190),
  ('conservas', 'conservas', 200),
  ('cereales', 'cereales', 210),
  ('galletas', 'galletas', 220),
  ('papel higiénico', 'papel higienico', 230),
  ('detergente', 'detergente', 240),
  ('champú', 'champu', 250)
on conflict (termino_normalizado) do nothing;

comment on table public.terminos_rastreo is
  'Términos editables utilizados por los rastreos automáticos. Un array de supermercados vacío significa todos.';
