-- Undo 0059_pagasa_warnings.sql. Safe to run twice. Drops the warnings table (public PAGASA text only; the next pagasa-warnings run would refill what is current).
drop policy if exists pagasa_warnings_read on public.pagasa_warnings;
drop index if exists public.pagasa_warnings_fetched;
drop table if exists public.pagasa_warnings;
