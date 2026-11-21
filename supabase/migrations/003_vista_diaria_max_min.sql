-- ============================================================
-- ClimaTech - Migración 003: máximos y mínimos diarios de temperatura
-- Permite estimar el rango (máx/mín) de cada día proyectado, como hacen
-- las páginas de clima. Es OPCIONAL: sin esta migración el sistema funciona
-- igual, solo que no muestra el rango estimado.
-- Es seguro ejecutarla más de una vez.
-- ============================================================

-- CREATE OR REPLACE VIEW solo permite AGREGAR columnas al final, sin cambiar las existentes.
create or replace view public.registros_diarios as
select
  fecha,
  avg(temperatura)::float8      as temperatura,
  avg(humedad)::float8          as humedad,
  avg(velocidad_viento)::float8 as velocidad_viento,
  count(*)                      as lecturas,
  max(temperatura)::float8      as temperatura_max,
  min(temperatura)::float8      as temperatura_min
from public.registros_climaticos
group by fecha;

-- La vista corre con permisos de su dueño: se mantiene cerrada a la API pública.
revoke all on public.registros_diarios from anon, authenticated;
grant select on public.registros_diarios to service_role;
