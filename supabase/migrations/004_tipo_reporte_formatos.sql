-- ============================================================
-- ClimaTech - Migración 004: formatos de reporte
--
-- El backend guarda en reportes.tipo el formato del archivo ('pdf', 'word' o 'excel'),
-- pero la columna es del tipo enumerado `tipo_reporte`, que no incluye esos valores.
-- Error que provoca: invalid input value for enum tipo_reporte: "pdf"
--
-- PASO 1 (opcional): ver qué valores tiene hoy el tipo.
--   select e.enumlabel
--   from pg_enum e join pg_type t on t.oid = e.enumtypid
--   where t.typname = 'tipo_reporte' order by e.enumsortorder;
--
-- PASO 2: agregar los tres formatos. Es seguro repetirlo.
-- Si el editor se queja, ejecuta cada línea por separado.
-- ============================================================

alter type public.tipo_reporte add value if not exists 'pdf';
alter type public.tipo_reporte add value if not exists 'word';
alter type public.tipo_reporte add value if not exists 'excel';
