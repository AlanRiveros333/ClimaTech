-- ============================================================
-- ClimaTech - Migración 002: IA, alertas por correo y fenómenos
-- Ejecutar en el SQL Editor de Supabase (nube o local).
-- Es seguro ejecutarla más de una vez.
-- ============================================================

-- 1) Preferencia de alertas por usuario -----------------------
alter table public.profiles
  add column if not exists alertas_activas boolean not null default false;

-- 2) Registro de alertas enviadas (evita correos repetidos) ---
create table if not exists public.alertas_enviadas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  tipo text not null,
  nivel text not null,
  fecha_pronostico date not null,
  mensaje text not null,
  enviado_en timestamptz not null default now(),
  unique (usuario_id, tipo, fecha_pronostico)
);

alter table public.alertas_enviadas enable row level security;

drop policy if exists "alertas_propias" on public.alertas_enviadas;
create policy "alertas_propias" on public.alertas_enviadas
  for select to authenticated using (usuario_id = auth.uid());

-- 3) Eventos climáticos (El Niño / La Niña) -------------------
create table if not exists public.eventos_climaticos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  fase text not null check (fase in ('el_nino', 'la_nina')),
  intensidad text not null check (intensidad in ('debil', 'moderado', 'fuerte', 'muy_fuerte')),
  fecha_inicio date not null,
  fecha_fin date,                       -- null = evento en curso
  fuente text not null default 'NOAA CPC',
  notas text,
  created_at timestamptz not null default now(),
  check (fecha_fin is null or fecha_fin >= fecha_inicio),
  unique (nombre, fecha_inicio)
);

alter table public.eventos_climaticos enable row level security;

drop policy if exists "eventos_lectura" on public.eventos_climaticos;
create policy "eventos_lectura" on public.eventos_climaticos
  for select to authenticated using (true);

-- Fechas aproximadas (a nivel de mes). Verificar con la tabla ONI/RONI de
-- NOAA CPC y corregir desde la pantalla "Fenómenos" si hace falta.
insert into public.eventos_climaticos (nombre, fase, intensidad, fecha_inicio, fecha_fin, notas) values
  ('El Niño 2009-10', 'el_nino', 'moderado',   '2009-06-01', '2010-04-30', 'Fechas aproximadas'),
  ('La Niña 2010-11', 'la_nina', 'fuerte',     '2010-07-01', '2011-05-31', 'Fechas aproximadas'),
  ('La Niña 2011-12', 'la_nina', 'moderado',   '2011-08-01', '2012-04-30', 'Fechas aproximadas'),
  ('El Niño 2015-16', 'el_nino', 'muy_fuerte', '2015-03-01', '2016-05-31', 'Fechas aproximadas'),
  ('El Niño 2018-19', 'el_nino', 'debil',      '2018-09-01', '2019-06-30', 'Fechas aproximadas'),
  ('La Niña 2020-21', 'la_nina', 'moderado',   '2020-08-01', '2021-04-30', 'Fechas aproximadas'),
  ('La Niña 2021-22', 'la_nina', 'moderado',   '2021-08-01', '2022-04-30', 'Fechas aproximadas'),
  ('La Niña 2022-23', 'la_nina', 'moderado',   '2022-07-01', '2023-03-31', 'Fechas aproximadas'),
  ('El Niño 2023-24', 'el_nino', 'fuerte',     '2023-05-01', '2024-04-30', 'Fechas aproximadas'),
  ('El Niño 2026-27 (superniño)', 'el_nino', 'muy_fuerte', '2026-06-01', null,
     'En curso. Fecha de inicio aproximada: confirmar con el diagnóstico ENSO de NOAA CPC')
on conflict (nombre, fecha_inicio) do nothing;

-- 4) Vista de promedios diarios (1 fila por día) --------------
-- Evita el límite de 1000 filas de la API cuando hay datos horarios.
create or replace view public.registros_diarios as
select
  fecha,
  avg(temperatura)::float8      as temperatura,
  avg(humedad)::float8          as humedad,
  avg(velocidad_viento)::float8 as velocidad_viento,
  count(*)                      as lecturas
from public.registros_climaticos
group by fecha;

-- La vista corre con permisos de su dueño: se cierra a la API pública.
revoke all on public.registros_diarios from anon, authenticated;
grant select on public.registros_diarios to service_role;
