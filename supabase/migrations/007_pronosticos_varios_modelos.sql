-- ============================================================
-- ClimaTech - Migración 007: pronósticos pasados de VARIOS modelos meteorológicos
-- Hasta ahora pronosticos_previos guardaba solo el «best match» de Open-Meteo.
-- Desde ahora guarda también ECMWF, GFS, ICON, JMA, GEM y UKMO, así que el modelo
-- forma parte de la clave primaria. Los datos existentes se conservan.
-- Es segura de ejecutar más de una vez.
-- ============================================================

alter table public.pronosticos_previos drop constraint if exists pronosticos_previos_pkey;
alter table public.pronosticos_previos add constraint pronosticos_previos_pkey
  primary key (fecha, variable, anticipacion, modelo);

create index if not exists pronosticos_previos_variable_modelo_idx
  on public.pronosticos_previos (variable, modelo, fecha);
