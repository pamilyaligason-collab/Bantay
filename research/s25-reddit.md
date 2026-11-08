# S25 Family Bantay: channel research (Reddit routes A and B)

Method notes
- WebSearch ignores the `site:reddit.com` operator. Results were mostly news, Wikipedia and fact-check pages, with almost no reddit.com threads.
- Arctic Shift (`arctic-shift.photon-reddit.com`) works. It is rate-limited (4-5 s between calls, frequent "Timeout"). Reddit evidence below comes from it.
- Channel IDs were resolved from `https://www.youtube.com/@handle` (Mozilla UA). Videos were checked with oEmbed (HTTP 200 and matching author_name).

## Channel table

| target | channel | id | handle | evidence (reddit URL) | verified? |
|---|---|---|---|---|---|
| Bilyonaryo News Channel | Bilyonaryo News Channel (news, not health) | UCiXhD6IScRs5r-tDvVvKjSA | @bncphl | none found | Channel yes. Reddit no. |
| Philippine Red Cross (official) | Philippine Red Cross | UCgOjJAt-DeWsoCydSmiFxLw | @PhilippineRedCross | none found (Arctic Shift "red cross youtube" = 0 hits) | Channel and videos yes. Official status unconfirmed. |
| Philippine Red Cross (alt) | Philippine Red Cross Official | UCGHvTM8z9r8zd49VyKbD-dA | @PhilippineRedCrossOfficial | none | Videos yes. Two PRC handles exist, so pick one. |
| DOH Philippines | dohphilippines (2020-era uploads) | UCt-_gpi0BNQf03960v5T93g | @DOHPhilippines | none | Videos yes. Recommended. |
| DOH Philippines (alt, older) | DOHPh (2012 uploads) | UC3KlpeazV9nvmaQnOUiajBA | @DOHPH | none | Videos resolve, but old. Confirm before use. |
| MIX NI KUYA | MIX NI KUYA (construction, AutoCAD, tiles) | UCf8pe1HR2Cj_R_XXJxBCD1w | @MixNiKuya | none | Videos yes. NOT health/cooking. Likely not a fit. |
| Agri Tayo Dito (DA-ATI) | Not found. @AgriTayoDito is "Agri ta diri" (UCy9TlVKF4kGrjz42WJGp2fA), unrelated. | n/a | n/a | https://www.reddit.com/r/Philippines/comments/54i0yh/i_think_our_tv_networks_should_add_more_shows/ (2016 mention, ABS-CBN show) | No. Show was ABS-CBN, ended 2018. |
| DA-ATI (other) | ATIPH | UC0rJ4JAwSCiGTbHr2HdW9LQ | @ATIPH | none | Channel resolves. Videos not checked. |
| Office of Civil Defense (OCD) | Not found. @OCDPH, @OCDPhilippines, @OfficeofCivilDefensePH, @NDRRMCPH all 404. | n/a | n/a | Arctic Shift "civil defense" hits are news, not channel | No. Next: check the footer of ocd.gov.ph. |
| Yummy Kitchen | Not found. @YummyKitchenPH 404. | n/a | n/a | none | No. Alternatives (unverified): Panlasang Pinoy, Kawaling Pinoy. |
| Low-sodium Filipino cooking | None found | n/a | n/a | none | No. |

## Video IDs (oEmbed 200, author matches)

| video id | title | author | topic |
|---|---|---|---|
| lTW-RHPMhWI | Agenda Weekend, November 8, 2026 | Bilyonaryo News Channel | news |
| 4lZRVpkK51s | Bagyong Cempaka, PAR, direct effects (Tagalog) | Bilyonaryo News Channel | news/weather |
| Vb9ObypTG08 | Work suspension at 40C heat (Tagalog) | Bilyonaryo News Channel | news/heat |
| 90mfcSQNr_I | DONATE NOW, Philippine Red Cross Relief Kits | Philippine Red Cross Official | donation |
| oUtfug03zUw | Red Report, October 2023 Highlights | Philippine Red Cross Official | annual update |
| da8N0sVfqhg | Philippine Red Cross Hazards App | Philippine Red Cross | disaster prep |
| eOuiUlOi6us | Secretary Francisco Duque Message on Garantisadong Pambata | dohphilippines | health campaign |
| JGd8nTh9gXo | APIR: Limang Paalala Para Maka-IWAS sa DISGRASYA (Tagalog) | DOHPh | disaster/injury safety |
| NQvmn-KVvkE | APIR: Limang Paraan Para sa LIGTAS NA PAGDIRIWANG (Tagalog) | DOHPh | safe celebration |
| qAFJ1wE3XN0 | Ceramic vs porcelain tiles | MIX NI KUYA | construction (not health) |

## Scam warning (Reddit + fact-checks)
- Reddit: https://www.reddit.com/r/Philippines/comments/1erwnps/is_drwillie_ong_a_legitimate_doctor_can_we_trust/ ("Is Dr. Willie Ong a legitimate doctor? can we trust him??"). Use it as a caution signal.
- Fact-checks (from search, not Reddit): Rappler reports a deepfake of Doc Willie Ong endorsing a voice/throat supplement, and a 2018 video from his channel reused for a hypertension ad. VERA Files reports AI-manipulated clips used for an eye-product ad. Do not add or endorse any "Doc Willie Ong" product channel.
- Reddit scam-warning threads for DOH/PRC/OCD impersonation: none found.

## Gaps: still not found
- Bilyonaryo: no Reddit evidence. Also a news channel, so it is a weak fit for health.
- OCD official YouTube channel (handle unknown). Check ocd.gov.ph footer.
- Agri Tayo Dito / DA-ATI official national channel (show was ABS-CBN, ended 2018).
- Yummy Kitchen or any low-sodium Filipino cooking channel.
- Bisaya/Cebuano health channel: nothing found. Bisaya gardening: not searched.
- Tagalog breathing/relaxation channel: none on YouTube. Only "Ginhawa sa Paghinga" (Ka Manu Iwa podcast, not YouTube).
- Tagalog explainers: asthma, COPD, UTI, anemia, arthritis, anxiety. Only leads: CDC "What You Need to Know Asthma" (English, no Tagalog version confirmed); BC Lung Foundation Filipino (Tagalog) COPD Self-Care Video Series (bclung.ca, channel not resolved). UTI, arthritis and anxiety were not found.
- Reddit: the Red Cross and Bilyonaryo queries returned nothing, and WebSearch never honored site:reddit.com, so reddit evidence is thin.

## Recommendation for the app (for the orchestrator to decide)
- Government/official: DOH via @DOHPhilippines (UCt-_gpi0BNQf03960v5T93g). PRC via @PhilippineRedCross (UCgOjJAt-DeWsoCydSmiFxLw) or @PhilippineRedCrossOfficial. Confirm which PRC handle is official on redcross.org.ph.
- Skip MIX NI KUYA (construction). Skip Bilyonaryo for the health feed (news only).
- Do not use any channel for Doc Willie Ong content without a check.
