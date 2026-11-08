# S25 channel and video research (Family Bantay)

Read-only. No repo file was edited. All video ids below were checked against YouTube oEmbed on 2026-11-08 (HTTP 200); titles and authors are as oEmbed returned them.

## Input gap

`research/s24-channels-expanded.md` does not exist in the worktree (`family-bantay-s25-189f00`), in git history (`git log --all -- research/*` is empty) or in the vault search that was started. Channel list and existing ids were taken from the task text, `src/data/videos.json` (30 health entries) and `src/data/discover/ready.json` (32 videos, 11 reads). Ids already in the app (62) were not repeated.

## 1. Channels

| channel | id | handle | language | section | status |
|---|---|---|---|---|---|
| GMA News (GMA Integrated News) | UCqYw-CTd1dU2yGI71sEyqNw | @gmanews | Filipino/English | Be prepared | id from handle; oEmbed author @gmanews matches |
| ABS-CBN News | UCE2606prvXQc_noEqKxVJXA | @abscbnnews | Filipino/English | Be prepared | oEmbed verified |
| Bilyonaryo News Channel | UCiXhD6IScRs5r-tDvVvKjSA | @bncphl | Filipino/English | news (not used) | id from handle, no oEmbed video checked; business news, low fit |
| Agri Tayo Dito (DA/ATI) | UCy9TlVKF4kGrjz42WJGp2fA | @AgriTayoDito | Filipino | Farming | id from handle; channel page returned no video list. Verified Agri Tayo Dito items are by other uploaders, so not used |
| PHIVOLCS | UCNtpwEyrUvcs7HHppMbLP8A | @PHIVOLCS | Filipino/English | Be prepared | already in app (2 videos); no new verified id |
| Civil Defense PH (OCD) | UC6R5ztihJRbS7U331S_rEGw (unconfirmed) | @civildefensephilippines (unconfirmed) | Filipino/English | Be prepared | NOT confirmed as OCD. @OCDPhilippines, @ocdgovph, @OfficialOCD did not resolve |
| Philippine Red Cross Official | UCGHvTM8z9r8zd49VyKbD-dA | @PhilippineRedCrossOfficial | Filipino/English | Be prepared | id from handle, no video list. Second handle @PhilippineRedCross resolves to UCgOjJAt-DeWsoCydSmiFxLw, which is unconfirmed. No official PRC video verified |
| Agri-nihan | UCnwtSN6CBEJJQt2cLuUek7A | @Agrinihan | Filipino | Farming | oEmbed verified (video author "Agri - nihan") |
| Don Bustamante Rooftop Gardening | UC_mfYDDOF3U5mjFwEqfiklw | @DonBustamanteRooftopGardening | Filipino | Farming | oEmbed verified (video author matches) |
| MIX NI KUYA | UCf8pe1HR2Cj_R_XXJxBCD1w | @MIXNIKUYA | Filipino (assumed) | Recipes | id from handle; no videos checked; content not confirmed |
| Dr. Gary Sy (Gabay sa Kalusugan) | UCdSsDfC0tsd01Da1JtnjxfA | @GabaySaKalusugan | Filipino/English | Health | oEmbed verified (author "Gabay sa Kalusugan - Dr. Gary Sy") |
| Cleveland Clinic | UCxyiSz4m161Z6frOsFxJpgw | @ClevelandClinic | English | Health | oEmbed verified (author_url @clevelandclinic) |
| WHO | UCT7a_fVlSrjOs9jyvtH-uhA | @WHO | English | Health | oEmbed verified (author "World Health Organization (WHO)") |
| Mga Kwentong Pampatulog | UCHynclzgY9-JnQkkLKcCZgg | @MgaKwntngPampatulog | Tagalog | Listen | oEmbed verified (author_url @MgaKwntngPampatulog). Note: UCiiA6oalbIxZ388KJXRnPg is a different channel (@MgaKwentongPampatulog); do not use |
| Headspace | UC3JhfsgFPLSLNEROQCdj-GQ | @headspace | English | Listen | oEmbed verified (author "Headspace") |
| Yummy Kitchen | not found | - | - | Recipes | Search found no PH "Yummy Kitchen" channel. Candidate: Yummy Magazine (Summit Media) @yummyph = UCq8Qqa1rEbuIAKIp0zZJtzQ, not verified |

Extra Philippine channels (gap fill): none verified in this run. Unverified names from search results: Kawaling Pinoy and Judy Ann's Kitchen (recipes), Doc Willie Ong's second channel "Doc Willie & Liza 2nd Channel" (health, same creator). DOH: no current official YouTube channel confirmed; the one hit is a 2020 archived link (UChZQaAATaHjT_wG-kac3qfA), not verified active. PAGASA: @PAGASA_DOST = UCxB1Wkc6vYxCUfOrw9gq8fA (handle resolved, no videos listed) and PAGASA videos already in app.

## 2. Videos by channel (oEmbed 200)

| video id | title | author | topic | oEmbed 200 date |
|---|---|---|---|---|
| Eb2vT_3O848 | 3rd quarter nationwide simulataneous earthquake drill, isinasagawa... | GMA Integrated News Bulletin \| GMA News | Be prepared | 2026-11-08 |
| fmJlnEExTvg | Safety measures during typhoon calamity | ABS-CBN News | Be prepared | 2026-11-08 |
| --3VleyQw8o | Mga Fertilizer na organic at chemical/inorganic para sa pechay | Agri - nihan | Farming | 2026-11-08 |
| ftx42ygHLqM | My Very Own Rooftop Edible Garden I Container Gardening Ideas | Don Bustamante Rooftop Gardening | Farming | 2026-11-08 |
| 2Q5T4uceQL8 | Mga Kwentong Pampatulog Para sa Bata at Matanda | Mga Kwentong Pampatulog | Listen | 2026-11-08 |
| 2Co5D1i9vdM | Quiet Mental Chatter Nighttime SOS\| Sleep Meditation | Headspace | Listen | 2026-11-08 |
| ft-vhYwHzxw | Racing Thoughts While Trying To Sleep? Try This. | Headspace | Listen | 2026-11-08 |
| ffzm2RGb0vU | Be prepared for emergencies with hands-only CPR | American Red Cross | First aid | 2026-11-08 |

Non-official, not used: Pu2Cbmt0HnM (PLV NSTP, CPR), 1Z4kzgG4pCk (Palacio AI Studio, PRC training), Rvz5tyQxciI (PTV Philippines, PRC National CPR Day), F-4CgEw4lk0 and dS-6iGXHOoo (The Everett's Academe, rescue breathing and infant CPR).

Excluded after oEmbed check: jcS7isLXXy8 (author Maijan Garden, not Don Bustamante), _UZl2W6pnSQ (ABS-CBN special coverage, not tips), 9KdumJQYwSw (CLP, Hong Kong), SJQysU-uZWg (Canadian Red Cross), PpinAhnoW-c (HN Kids world).

Cleveland Clinic channel (all author "Cleveland Clinic" except the first): cqLZhO06yeE (author "Ask Cleveland Clinic's Expert \| Cleveland Clinic"), mBpdD3j2oqM, Kg0bn23S_vw, pJYCTh3_OWQ, pr29CWlkg8Y. Use Kg0bn23S_vw and pr29CWlkg8Y in Health.

## 3. Health explainers by topic (max 2 each, oEmbed 200)

| topic | video id | title | author | source type |
|---|---|---|---|---|
| hypertension | dgistW5hR4s | Tamang Pag-Check ng Blood Pressure - Dr. Gary Sy | Gabay sa Kalusugan - Dr. Gary Sy | Filipino |
| hypertension | Kg0bn23S_vw | Hypertension: What It Is and How to Manage It | Cleveland Clinic | US |
| diabetes | AeKK5TzXqis | WARNING SIGNS! Diabetes-Related Feet Complications - Dr. Gary Sy | Gabay sa Kalusugan - Dr. Gary Sy | Filipino |
| dengue | V1TPAmsn1us | WHO's Science in 5 - Dengue Fever - 28 March 2024 | World Health Organization (WHO) | WHO |
| dengue | BklPK1xKjkE | What is dengue? | WHO European Region | WHO |
| tuberculosis | ZG6BnDQX3gI | Sakit sa Baga: Paano Maalis ang TB (Tuberculosis) - By Doc Willie Ong | Doc Willie Ong | Filipino |
| tuberculosis | NzOLqadEk4c | Palakasin ang Baga in 1 Month: Para sa Plema, Pulmonya, TB, Na-Co-vid- - By Doc Willie Ong #1400 | Doc Willie Ong | Filipino |
| stroke | adNWwnudyTc | Stroke: 8 Warning Signs - by Doc Willie Ong #920 | Doc Willie Ong | Filipino/English |
| stroke | DxD6eYEG1BM | 6 Signs na Posibleng Na-Stroke Habang Tulog - By Doc Willie Ong | Doc Willie Ong | Filipino |
| heart attack | PXhBoH5aD_s | 8 Warning Signs ng Heart Attack Bago Ito Mangyari. - By Doc Willie Ong | Doc Willie Ong | Filipino |
| heart attack | 5_E9Gb4VF7s | 3 Traydor na Sintomas ng Heart Attack - Tips by Doc Willie Ong | Doc Willie Ong | Filipino |
| kidney disease | 8jcL3TlgF4A | Mayo Clinic Minute: Understanding chronic kidney disease | Mayo Clinic | Mayo |
| kidney disease | oO0PupWnOgc | Chronic Kidney Disease: Mayo Clinic Radio | Mayo Clinic | Mayo |
| gout | XK6ZZw2xuVM | Gout and Heart Disease - Dr. Gary Sy | Gabay sa Kalusugan - Dr. Gary Sy | Filipino |
| leptospirosis | hisdjEPue-A | Baha at Leptospirosis: Alamin ang Lunas - Payo ni Doc Willie Ong #517 | Doc Willie Ong | Filipino |
| leptospirosis | uPBHwXyGxEU | Lumusong sa Baha, Babala sa Leptospirosis, Typhoid Fever - Tips By Doc Willie Ong | Doc Willie Ong | Filipino |
| pneumonia | D6VJurxcQgY | Pneumonia: Simple Health Remedies - Tips by Doc Willie Ong #910 | Doc Willie Ong | Filipino |
| first aid CPR | ffzm2RGb0vU | Be prepared for emergencies with hands-only CPR | American Red Cross | Red Cross |
| depression/anxiety | none | - | - | Lusog-Isip (DOH) already in app |
| dementia | none new | - | - | Doc Willie Alzheimer video NbaU... already in app |
| choking, burns | none new | - | - | Heimlich and burn videos already in app |

## Failed or not found

- **No verified video, asthma, COPD, UTI, anemia, arthritis.** Cleveland Clinic and Mayo searches returned none. 0jfM3ryDkHU (gout) is by GoutEducation, not Cleveland Clinic, so excluded.
- **Depression and anxiety.** CFd4bSsdD4c is by WKYC Channel 3, not Cleveland Clinic. Excluded.
- **Dementia.** eptqlPCpbxY is by Being Patient, excluded.
- **Ids that 404 or 400/401**, discarded: VDzSyZaghpM, Y69Y61Y5ezg, 8Fc2zpAKA0U, EA17vp12zrQ, u5VTUl7E3E (400), gBektU9gSwU (404), dLLyuMKe-o (400), qCbRTnJPnMqg (401), d6__uypqzDM (401).
- **Mismatched authors, excluded**: ovlcJuI7q4o (ABC15 Arizona, not Mayo), UTQ9zZSJQI4 (Medical Dialogues, not WHO), YYCrKJR1T0M (UF EPI, not WHO), AkDhbThbtpg (KC, not Headspace).
- **Channels not confirmed**: DOH, OCD, PRC official video list, Agri Tayo Dito video list, Bilyonaryo videos, MIX NI KUYA, Yummy Kitchen, Yummy Magazine.
- **Channel page scraping** (`/videos` pages) returned no video grid for most channels, so video discovery used web search, which can miss recent uploads.
- **Dates**: the "oEmbed 200 date" column is the check date (2026-11-08). oEmbed does not return upload dates.

## Caveats for the health content

- Doc Willie Ong and Dr. Gary Sy are Filipino private practitioners, not government or WHO sources. Doc Willie Ong has a second channel, "Doc Willie & Liza 2nd Channel", whose videos (L1TQ6EEI_c4, llUUrhxz-sU, REcDwNXJBA8) are the same creator.
- Medical wording needs a clinician check before it ships, per the open "Opus health-wording check" note in ready.json.
