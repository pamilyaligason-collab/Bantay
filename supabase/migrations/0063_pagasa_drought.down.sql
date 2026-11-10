-- Undo 0063_pagasa_drought.sql. Safe to run twice. Drops the outlook table (public PAGASA text only; the next pagasa-drought run would refill it).
drop policy if exists pagasa_drought_read on public.pagasa_drought;
drop table if exists public.pagasa_drought;
