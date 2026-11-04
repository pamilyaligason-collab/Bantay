-- Family Bantay Phase 2, lane G (W6): world_news, the GDELT headlines behind "Macro and news" on the World screen.
-- Needs 0023 (is_family_member). Written only; applied ONLY when the owner says "apply 0049". The app never requires it (a missing table reads as "could not load headlines"). Safe to run twice. Undo: 0049_world_news.down.sql.
--
-- * One row per article link: id = 'gdelt-' + first 16 hex of sha-256(url), so a rerun upserts the same row. Third-party text: title, url, source_domain are plain strings, shown as text only.
-- * Readers: any active family member (is_family_member). Writer: the world-news edge function with the service role. The 7-day purge runs in that function (ML-06); the CHECKs cap field sizes.
-- * No person's data, no location: public headlines only.

create table if not exists public.world_news (
  id text primary key check (length(id) between 1 and 64),
  title text not null check (length(title) between 1 and 400),
  url text not null check (length(url) <= 2000 and url ~* '^https?://'),
  source_domain text not null default '' check (length(source_domain) <= 100),
  seen_at timestamptz not null,
  lang text not null default '' check (length(lang) <= 30),
  theme text not null default '' check (length(theme) <= 30)
);
create index if not exists world_news_seen on public.world_news (seen_at desc);

alter table public.world_news enable row level security;
revoke all on public.world_news from anon, authenticated;
grant select on public.world_news to authenticated;
grant select, insert, update, delete on public.world_news to service_role;
drop policy if exists world_news_read on public.world_news;
create policy world_news_read on public.world_news for select to authenticated using (public.is_family_member());
