# mdwiki offline pack (D-158)

Builds the optional "Full medical library" file the app downloads once on Wi-Fi.

## Build (orchestrator, once)

1. Download the Kiwix ZIM yourself (about 2.1 GB, not done in CI): `mdwiki_en_all_maxi_YYYY-MM.zim` from https://download.kiwix.org/zim/other/
2. `pip install libzim` (`Pillow` is only for the optional `--images`)
3. `python scripts/medlib/mdwiki-pack.py mdwiki_en_all_maxi_YYYY-MM.zim medlib-mdwiki.pack`
   The pack is text-only by default (what the app promises). Optional, documented but untested on the real ZIM: `--images` (at most one webp of 30 KB or less per article, `--max-image-kb N` to change), `--limit N` for a trial run.
   It prints the article count and total size. Set `FULL_LIBRARY_MB` in `src/features/health/library/fullLibrary.ts` to that size.
4. Upload `medlib-mdwiki.pack` as a release asset of tag `medlib-v1` (the URL in `FULL_LIBRARY_URL`). GitHub release downloads honour HTTP Range, which the app uses to resume.

Test: `python -m unittest scripts/medlib/test_mdwiki_pack.py` builds a tiny synthetic ZIM with libzim's Creator and rewrites `fixtures/mini.pack`, which the client tests read.

## Pack format (little-endian)

`b'BMDW1\n'` | u32 header length | header JSON | u32 index length | index JSON | body

- Header: format, version, built, source, sourceUrl, zim, licence (`CC BY-SA 4.0`), licenceUrl, `changes` (`converted to plain text; citations, navigation boxes and edit links removed`), credit, articles, images.
- Index: `[[key, title, offset, length, lead], ...]`; offset is relative to the start of the body. The app keeps this in memory for title search.
- Body: one gzip member per article, JSON `{key, title, url, text, image?}`. One article is one range read.

## Licence

mdwiki.org text is CC BY-SA 4.0. The changes are: HTML to plain text (headings kept as `## Heading`, list items as `- item`); citations, navigation boxes and edit links removed. The header carries that statement and every article carries its mdwiki source URL; the app shows the credit, the licence link and the source link on every article.
