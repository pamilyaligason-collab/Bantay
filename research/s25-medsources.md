# S25 medical encyclopedia sources (read-only research, 2026-11-08)

Scope: sources for an offline, easy-to-read mini medical encyclopedia in Family Bantay (PWA + Capacitor, Philippines, seniors). No repo files edited.

## 1. MedlinePlus health topics bulk XML

- Current files (generated 2026-11-07), per https://medlineplus.gov/xml.html:
  - mplus_topics_2026-11-07.xml, 29,474 K (DTD 5 K)
  - mplus_topics_compressed_2026-11-07.zip, 4,683 K
  - mplus_topic_groups_2026-11-07.xml, 11 K (DTD 3 K)
- Fields per topic (as described on the page): title, URL, language, date created, ID; MeSH terms, "Also called" terms, see references; full summary; group membership; related health topics; equivalent English/Spanish topic (Spanish link); related content in other languages; primary NIH institute; site records (links with names, URLs, organisations, categories, standard descriptions).
- Reuse terms: page gives no explicit public-domain statement and no formal licence. It asks that you "indicate that the information is from MedlinePlus.gov". It links to a Copyright page (https://medlineplus.gov/about/using/usingcontent/), whose text I could not confirm. Restrictions on images, logos or third-party content are NOT confirmed. Site records can point to third-party sites, so check those per link.
- Update frequency: published daily, Tuesday to Saturday (same page).
- English topic count: not stated on the page. Not verified.
- Sources: https://medlineplus.gov/xml.html ; https://medlineplus.gov/about/using/usingcontent/ (linked, not fetched)

## 2. MDWiki (WikiProject Med Foundation)

- Licence: MDWiki accepts only CC BY-SA, CC BY and public-domain text. Video may carry NC or ND licences. Kiwix archive states text is CC BY-SA. Media files need per-file checks.
  - Sources: https://mdwiki.org/wiki/WikiProject_Med_Foundation (403, not read); search summary citing https://meta.wikimedia.org/wiki/Wiki_Project_Med/App and https://sourceforge.net/app/wikimed-by-kiwix/ (search snippets, not fetched in full)
- Offline: Kiwix ZIM files, via the WikiMed app (Kiwix-based). Current Kiwix "other" listing (https://lb.download.kiwix.org/zim/other/):
  - mdwiki_en_all_2024-06.zim, 8.0G (2024-06-13)
  - mdwiki_en_all_2025-11.zim, 10G (2025-11-14)
  - mdwiki_en_all_maxi_2024-06.zim, 1.8G (2024-06-13)
  - mdwiki_en_all_maxi_2025-11.zim, 2.1G (2025-11-13)
  - No "simple", "app" or "nopic" variants listed.
  - Reader-side: the "maxi" 2025-11 build (2.1G) is the practical size reference; confirm whether it includes images before relying on it.
- MediaWiki API (MDWiki): not verified. MDWiki pages were blocked (403), so no MDWiki endpoint was confirmed. Use the Wikipedia pattern below only if MDWiki is ruled out.
- Wikipedia lead + lead image (verified response shape, not the request itself):
  `https://en.wikipedia.org/w/api.php?action=query&prop=extracts|pageimages&exintro=1&explaintext=0&piprop=original&titles=Tuberculosis&format=json&formatversion=2`
  Returns extract (intro text) and pageimages.original.source (upload.wikimedia.org URL). Source: fetched response for that URL (tracking params utm_* appear in image URL; strip if reused).
- Attribution for reuse of Wikipedia text (CC BY-SA 4.0): credit authors (link to page or list authors), link or copy the licence, state changes, release any modified/added text under CC BY-SA 4.0 or later, and bundle image licences per file. Source: https://en.wikipedia.org/wiki/Wikipedia:Reusing_Wikipedia_content

## 3. Wikimedia Commons medical illustrations

- Blausen Medical gallery: most cited licence is CC BY 3.0. Credit form: "Image created by Blausen.com staff ... 'Medical gallery of Blausen Medical 2014'. WikiJournal of Medicine 1 (2). DOI:10.15347/wjm/2014.010. ISSN 2002-4436. Own work, CC BY 3.0." Sources: https://www.tga.gov.au/media/9537 ; https://en.wikiversity.org/wiki/Blausen_gallery_2014
- Labels are NOT uniform. Examples found: a Blausen cardiac muscle image labelled CC BY-SA (https://anatomytool.org/content/blausen-cardiac-muscle-english-labels); a red blood cell image labelled CC BY (https://anatomytool.org/node/58715); a SERC-hosted Blausen image labelled CC BY-NC-SA 3.0 (https://serc.carleton.edu/details/images/37789.html). Rule: check each file's Commons description page and record licence per image. Exclude NC files.
- BruceBlaus images: CC BY 3.0 Unported per a UTA anatomy lab credit (https://uta.pressbooks.pub/anatomylab/back-matter/image-credits/). Not checked on Commons directly.
- Commons category page (https://commons.wikimedia.org/wiki/Category:Blausen_Medical_gallery) returned 404 to WebFetch. Not verified.
- Recommended credit line per image: "[Title], [Author], [Licence], via Wikimedia Commons [file URL]".

## 4. Tagalog medical content

- MedlinePlus Tagalog page (https://medlineplus.gov/languages/tagalog.html) lists Tagalog handouts that are HOSTED ON OTHER SITES (ACS, CDC, FDA, Immunize.org, Reproductive Access, Hepatitis B Foundation, SF DPH, Minnesota DOH, ready.gov, FCC). Licences vary per document; the page does not state them. Examples:
  - Angina, CAD, Heart Failure, Stroke, Lung Cancer (storage.googleapis.com healthinfotranslations-pdfdocs)
  - What Is Cancer? (cancer.org, Tagalog booklet)
  - HPV, MMR, Influenza, Hepatitis B Vaccine Information Statements (immunize.org)
  - CDC Asthma FAQ, Carbon Monoxide flyer (cdc.gov)
  - Fight the Flu poster (health.state.mn.us)
  Rule: link out to these, do not bundle, unless each licence is checked.
- DOH Philippines: a 2020 archived DOH site footer says "all content is in the public domain unless otherwise stated". Source: search snippet only (archived copy, not fetched). Current DOH terms NOT verified; DOH health-topic pages in Filipino not located. Action: check the live DOH site terms before any use.
- Tagalog Wikipedia medicine articles: not searched in depth. Wikipedia CC BY-SA applies (see section 2).
- No Tagalog health encyclopedia with a confirmed public-domain or CC licence was found.

## 5. Other sources

- WHO fact sheets: publications under CC BY-NC-SA 3.0 IGO. Adaptation and translation need same/similar licence and a "not created by WHO" disclaimer. Commercial use needs separate permission. NC clause: a free app with no commercial use may fit, but any ads, paid tier or store monetisation makes it commercial. Verdict: avoid bundling; link out. Source: https://www.who.int/about/policies/publishing/copyright
- NHS conditions/API (nhs.uk): licence NOT verified (fetch returned 404 for two NHS URLs). Unverified; NHS website content is normally under the Open Government Licence, but confirm. Do not rely on this without checking.
- Merck Manual consumer version: copyright Merck & Co., Inc. and affiliates, all rights reserved (https://www.merckmanuals.com/en-ca/home/content/permissions and search snippet). Reuse requires a licence. Verdict: do not use.

## Recommendation table

| Source | Licence | Offline? | Reading level | Use it for |
|---|---|---|---|---|
| MedlinePlus topics XML (https://medlineplus.gov/xml.html) | Attribution requested; no formal licence stated; check Copyright page | Yes (bundle the XML or extracted summaries; 29.5 MB raw, 4.7 MB zipped) | Plain-language consumer summaries (good fit) | Primary text source for the encyclopedia; cite "MedlinePlus.gov" on every entry |
| Wikipedia lead via API (https://en.wikipedia.org/w/api.php) | CC BY-SA 4.0; attribution and share-alike | Only if you ship text | Mixed, often too technical for seniors | Optional supplement; needs credit block and licence note |
| MDWiki Kiwix ZIM (https://lb.download.kiwix.org/zim/other/) | CC BY-SA text; media per file | Yes (2.1 GB maxi 2025-11; 10 GB full) | Clinician-level, too technical | Reference only, not bundled in an app |
| Blausen via Wikimedia Commons (https://www.tga.gov.au/media/9537) | CC BY 3.0 mostly; some CC BY-SA, some CC BY-NC-SA (exclude NC) | Yes if bundled | Visual, reads well for seniors | Anatomy/disease illustrations; per-file credit |
| MedlinePlus Tagalog handouts (https://medlineplus.gov/languages/tagalog.html) | Varies per hosting site | No (link out) | Plain-language | Tagalog links from each entry, opened online |
| DOH Philippines (2020 archive footer) | "Public domain unless otherwise stated" (2020, unverified now) | Unknown | Local, official | Check current DOH terms first |
| WHO fact sheets (https://www.who.int/about/policies/publishing/copyright) | CC BY-NC-SA 3.0 IGO | Possible, but NC and share-alike | Plain | Do not bundle; link out |
| NHS conditions (https://www.nhs.uk) | Not verified | Unknown | Plain | Verify licence before any use |
| Merck Manual consumer | All rights reserved | No | Plain | Do not use |

## Next actions for Lloyd (none executed)

1. Confirm the MedlinePlus Copyright page text (https://medlineplus.gov/about/using/usingcontent/) before shipping bundled text.
2. Verify the NHS licence and the current DOH terms (both were not confirmed).
3. Pick the Blausen files per image and record each licence in the asset manifest.

Limits: several sources returned 403 or 404 (MDWiki project page, Commons Blausen category, NHS). Search snippets were used for some claims (DOH, MDWiki licence, Blausen labels). Not legal advice.
