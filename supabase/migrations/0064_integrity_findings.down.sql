-- Undo 0064_integrity_findings.sql. Safe to run twice. Drops only the findings list; no health record is touched (the function never wrote to one).
begin;
drop table if exists public.integrity_findings;
commit;
