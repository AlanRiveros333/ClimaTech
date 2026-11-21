-- ============================================================
-- ClimaTech - Migración 005: observaciones de la estación del aeropuerto
-- Guarda un resumen DIARIO de lo que midió la estación meteorológica del
-- Aeropuerto Jorge Wilstermann (código OACI SLCB), a partir de sus reportes
-- METAR horarios. Sirve como "verdad medida" para:
--   1) corregir el sesgo del historial de Open-Meteo (reanálisis de ~10 km),
--   2) verificar qué tan bien acertaron las proyecciones.
-- Es segura de ejecutar más de una vez.
-- ============================================================

create table if not exists public.observaciones_estacion (
  estacion          text not null default 'SLCB',
  fecha             date not null,
  temperatura       double precision,   -- promedio de las horas con dato (°C)
  temperatura_max   double precision,   -- °C
  temperatura_min   double precision,   -- °C
  humedad           double precision,   -- % promedio
  velocidad_viento  double precision,   -- km/h promedio
  horas             integer not null,   -- horas distintas con reporte ese día (máx. 24)
  fuente            text not null default 'IEM METAR',
  importado_en      timestamptz not null default now(),
  primary key (estacion, fecha)
);

-- Solo el backend (service_role) lee y escribe esta tabla.
alter table public.observaciones_estacion enable row level security;
revoke all on public.observaciones_estacion from anon, authenticated;
grant select, insert, update, delete on public.observaciones_estacion to service_role;
