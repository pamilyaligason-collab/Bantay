# Local safety data: coverage

One row per pack unit: 82 provinces, 33 highly urbanized cities (HUCs), Isabela City (Basilan), Pateros and the 8 BARMM Special
Geographic Area clusters: 125 units, each a PSGC code with no province above it.
A pack unit is what the app downloads as one region pack (`docs/local-data/APP-INTEGRATION.md`). This file is the plan; the live copy is the
`public.coverage` table (migration 0045), loaded from `supabase/seed/local-data/coverage.csv` once PSGC codes exist.

PSGC codes come from the pinned psgc.cloud snapshot (RESEARCH.md row 8); `node scripts/local-data/psgc.mjs` rebuilds `coverage.csv` from it
and from this table's order. Component cities (Dagupan, Santiago, Naga, Ormoc, Cotabato City) sit under a province code, so they ride in their
province's pack. The snapshot predates the Negros Island Region (2024): region names follow the codes.

Status words: **not started** / **in progress** (seed rows exist, review not finished) / **done** (every LGU has a DRRMO or hotline row, hospitals
and RHUs from NHFR, ECs where any source lists them, all rows reviewed) with the **verified** date of the last full review.

## Order

- **A. Home zones**: Bohol (Dampas, Tagbilaran), South Cotabato and General Santos City (Conel).
- **B. Visayas neighbours of Bohol**: Cebu and its HUCs, Siquijor, Negros Oriental, the Leytes, Camiguin (across the Bohol Sea).
- **C. SOCCSKSARGEN and Davao around GenSan**, plus the Maguindanaos and Cotabato City next to them.
- **D. Population**: NCR, then the largest provinces and their HUCs (2020 census order, roughly).
- **E. Hazard exposure**: the typhoon-facing east seaboard (Samar, Bicol, Caraga, Davao Oriental), the Cagayan valley and Batanes.
- **F. The rest**, Luzon and Mindanao, by region.

## Counts

| | Units | Not started | In progress | Done |
|---|---|---|---|---|
| Total | 125 | 116 | 9 | 0 |

Seed rows on 2026-10-31: Bohol 66, South Cotabato 24, General Santos City 6. **Published** (read on their source that day, so public and in
packs): Bohol 2 (Gallares hospital, Red Cross Bohol), South Cotabato + GenSan 25. The other 69 rows stay in the CSVs, not public, until a person
reads them on a source: Bohol's 2015 fire table, 2012 and news-snippet rows, the 10 Loon rows read from an image, the not-confirmed
Koronadal rows, and 3 GenSan rows (fire, police, Red Cross) whose notes cite a snippet for a conflicting number; a person re-reads them. Each keeps its source's own date in `source_date`.

## Table

| # | Unit | Kind | Region | Phase | PSGC | Status | Verified |
|---|---|---|---|---|---|---|---|
| 1 | Bohol | province | Region VII (Central Visayas) | A | 0701200000 | in progress | |
| 2 | South Cotabato | province | Region XII (SOCCSKSARGEN) | A | 1206300000 | in progress | |
| 3 | City of General Santos | huc | Region XII (SOCCSKSARGEN) | A | 1230800000 | in progress | |
| 4 | Cebu | province | Region VII (Central Visayas) | B | 0702200000 | in progress | |
| 5 | City of Cebu | huc | Region VII (Central Visayas) | B | 0730600000 | in progress | |
| 6 | City of Lapu-Lapu | huc | Region VII (Central Visayas) | B | 0731100000 | in progress | |
| 7 | City of Mandaue | huc | Region VII (Central Visayas) | B | 0731300000 | in progress | |
| 8 | Siquijor | province | Region VII (Central Visayas) | B | 0706100000 | in progress | |
| 9 | Negros Oriental | province | Region VII (Central Visayas) | B | 0704600000 | in progress | |
| 10 | Southern Leyte | province | Region VIII (Eastern Visayas) | B | 0806400000 | not started | |
| 11 | Leyte | province | Region VIII (Eastern Visayas) | B | 0803700000 | not started | |
| 12 | City of Tacloban | huc | Region VIII (Eastern Visayas) | B | 0831600000 | not started | |
| 13 | Camiguin | province | Region X (Northern Mindanao) | B | 1001800000 | not started | |
| 14 | Sarangani | province | Region XII (SOCCSKSARGEN) | C | 1208000000 | not started | |
| 15 | Sultan Kudarat | province | Region XII (SOCCSKSARGEN) | C | 1206500000 | not started | |
| 16 | Cotabato | province | Region XII (SOCCSKSARGEN) | C | 1204700000 | not started | |
| 17 | Davao del Sur | province | Region XI (Davao Region) | C | 1102400000 | not started | |
| 18 | City of Davao | huc | Region XI (Davao Region) | C | 1130700000 | not started | |
| 19 | Davao Occidental | province | Region XI (Davao Region) | C | 1108600000 | not started | |
| 20 | Maguindanao del Sur | province | Bangsamoro Autonomous Region In Muslim Mindanao (BARMM) | C | 1908800000 | not started | |
| 21 | Maguindanao del Norte | province | Bangsamoro Autonomous Region In Muslim Mindanao (BARMM) | C | 1908700000 | not started | |
| 22 | Quezon City | huc | National Capital Region (NCR) | D | 1381300000 | not started | |
| 23 | City of Manila | huc | National Capital Region (NCR) | D | 1380600000 | not started | |
| 24 | City of Caloocan | huc | National Capital Region (NCR) | D | 1380100000 | not started | |
| 25 | City of Taguig | huc | National Capital Region (NCR) | D | 1381500000 | not started | |
| 26 | City of Pasig | huc | National Capital Region (NCR) | D | 1381200000 | not started | |
| 27 | City of Valenzuela | huc | National Capital Region (NCR) | D | 1381600000 | not started | |
| 28 | City of Parañaque | huc | National Capital Region (NCR) | D | 1381000000 | not started | |
| 29 | City of Las Piñas | huc | National Capital Region (NCR) | D | 1380200000 | not started | |
| 30 | City of Makati | huc | National Capital Region (NCR) | D | 1380300000 | not started | |
| 31 | City of Muntinlupa | huc | National Capital Region (NCR) | D | 1380800000 | not started | |
| 32 | City of Marikina | huc | National Capital Region (NCR) | D | 1380700000 | not started | |
| 33 | Pasay City | huc | National Capital Region (NCR) | D | 1381100000 | not started | |
| 34 | City of Malabon | huc | National Capital Region (NCR) | D | 1380400000 | not started | |
| 35 | City of Mandaluyong | huc | National Capital Region (NCR) | D | 1380500000 | not started | |
| 36 | City of Navotas | huc | National Capital Region (NCR) | D | 1380900000 | not started | |
| 37 | City of San Juan | huc | National Capital Region (NCR) | D | 1381400000 | not started | |
| 38 | Pateros | municipality | National Capital Region (NCR) | D | 1381701000 | not started | |
| 39 | Cavite | province | Region IV-A (CALABARZON) | D | 0402100000 | not started | |
| 40 | Bulacan | province | Region III (Central Luzon) | D | 0301400000 | not started | |
| 41 | Laguna | province | Region IV-A (CALABARZON) | D | 0403400000 | not started | |
| 42 | Rizal | province | Region IV-A (CALABARZON) | D | 0405800000 | not started | |
| 43 | Pangasinan | province | Region I (Ilocos Region) | D | 0105500000 | not started | |
| 44 | Batangas | province | Region IV-A (CALABARZON) | D | 0401000000 | not started | |
| 45 | Pampanga | province | Region III (Central Luzon) | D | 0305400000 | not started | |
| 46 | City of Angeles | huc | Region III (Central Luzon) | D | 0330100000 | not started | |
| 47 | Negros Occidental | province | Region VI (Western Visayas) | D | 0604500000 | not started | |
| 48 | City of Bacolod | huc | Region VI (Western Visayas) | D | 0630200000 | not started | |
| 49 | Iloilo | province | Region VI (Western Visayas) | D | 0603000000 | not started | |
| 50 | City of Iloilo | huc | Region VI (Western Visayas) | D | 0631000000 | not started | |
| 51 | Quezon | province | Region IV-A (CALABARZON) | D | 0405600000 | not started | |
| 52 | City of Lucena | huc | Region IV-A (CALABARZON) | D | 0431200000 | not started | |
| 53 | Nueva Ecija | province | Region III (Central Luzon) | D | 0304900000 | not started | |
| 54 | Camarines Sur | province | Region V (Bicol Region) | D | 0501700000 | not started | |
| 55 | Albay | province | Region V (Bicol Region) | D | 0500500000 | not started | |
| 56 | Misamis Oriental | province | Region X (Northern Mindanao) | D | 1004300000 | not started | |
| 57 | City of Cagayan De Oro | huc | Region X (Northern Mindanao) | D | 1030500000 | not started | |
| 58 | Zamboanga del Sur | province | Region IX (Zamboanga Peninsula) | D | 0907300000 | not started | |
| 59 | City of Zamboanga | huc | Region IX (Zamboanga Peninsula) | D | 0931700000 | not started | |
| 60 | Eastern Samar | province | Region VIII (Eastern Visayas) | E | 0802600000 | not started | |
| 61 | Samar | province | Region VIII (Eastern Visayas) | E | 0806000000 | not started | |
| 62 | Northern Samar | province | Region VIII (Eastern Visayas) | E | 0804800000 | not started | |
| 63 | Biliran | province | Region VIII (Eastern Visayas) | E | 0807800000 | not started | |
| 64 | Sorsogon | province | Region V (Bicol Region) | E | 0506200000 | not started | |
| 65 | Catanduanes | province | Region V (Bicol Region) | E | 0502000000 | not started | |
| 66 | Masbate | province | Region V (Bicol Region) | E | 0504100000 | not started | |
| 67 | Camarines Norte | province | Region V (Bicol Region) | E | 0501600000 | not started | |
| 68 | Surigao del Norte | province | Region XIII (Caraga) | E | 1606700000 | not started | |
| 69 | Dinagat Islands | province | Region XIII (Caraga) | E | 1608500000 | not started | |
| 70 | Surigao del Sur | province | Region XIII (Caraga) | E | 1606800000 | not started | |
| 71 | Agusan del Norte | province | Region XIII (Caraga) | E | 1600200000 | not started | |
| 72 | City of Butuan | huc | Region XIII (Caraga) | E | 1630400000 | not started | |
| 73 | Agusan del Sur | province | Region XIII (Caraga) | E | 1600300000 | not started | |
| 74 | Davao Oriental | province | Region XI (Davao Region) | E | 1102500000 | not started | |
| 75 | Davao de Oro | province | Region XI (Davao Region) | E | 1108200000 | not started | |
| 76 | Davao del Norte | province | Region XI (Davao Region) | E | 1102300000 | not started | |
| 77 | Bukidnon | province | Region X (Northern Mindanao) | E | 1001300000 | not started | |
| 78 | Lanao del Norte | province | Region X (Northern Mindanao) | E | 1003500000 | not started | |
| 79 | City of Iligan | huc | Region X (Northern Mindanao) | E | 1030900000 | not started | |
| 80 | Misamis Occidental | province | Region X (Northern Mindanao) | E | 1004200000 | not started | |
| 81 | Cagayan | province | Region II (Cagayan Valley) | E | 0201500000 | not started | |
| 82 | Isabela | province | Region II (Cagayan Valley) | E | 0203100000 | not started | |
| 83 | City of Isabela | icc | Region IX (Zamboanga Peninsula) | E | 0990101000 | not started | |
| 84 | Aurora | province | Region III (Central Luzon) | E | 0307700000 | not started | |
| 85 | Batanes | province | Region II (Cagayan Valley) | E | 0200900000 | not started | |
| 86 | Tarlac | province | Region III (Central Luzon) | F | 0306900000 | not started | |
| 87 | Zambales | province | Region III (Central Luzon) | F | 0307100000 | not started | |
| 88 | City of Olongapo | huc | Region III (Central Luzon) | F | 0331400000 | not started | |
| 89 | Bataan | province | Region III (Central Luzon) | F | 0300800000 | not started | |
| 90 | Palawan | province | MIMAROPA Region | F | 1705300000 | not started | |
| 91 | City of Puerto Princesa | huc | MIMAROPA Region | F | 1731500000 | not started | |
| 92 | Oriental Mindoro | province | MIMAROPA Region | F | 1705200000 | not started | |
| 93 | Occidental Mindoro | province | MIMAROPA Region | F | 1705100000 | not started | |
| 94 | Marinduque | province | MIMAROPA Region | F | 1704000000 | not started | |
| 95 | Romblon | province | MIMAROPA Region | F | 1705900000 | not started | |
| 96 | Aklan | province | Region VI (Western Visayas) | F | 0600400000 | not started | |
| 97 | Capiz | province | Region VI (Western Visayas) | F | 0601900000 | not started | |
| 98 | Antique | province | Region VI (Western Visayas) | F | 0600600000 | not started | |
| 99 | Guimaras | province | Region VI (Western Visayas) | F | 0607900000 | not started | |
| 100 | Benguet | province | Cordillera Administrative Region (CAR) | F | 1401100000 | not started | |
| 101 | City of Baguio | huc | Cordillera Administrative Region (CAR) | F | 1430300000 | not started | |
| 102 | La Union | province | Region I (Ilocos Region) | F | 0103300000 | not started | |
| 103 | Ilocos Sur | province | Region I (Ilocos Region) | F | 0102900000 | not started | |
| 104 | Ilocos Norte | province | Region I (Ilocos Region) | F | 0102800000 | not started | |
| 105 | Nueva Vizcaya | province | Region II (Cagayan Valley) | F | 0205000000 | not started | |
| 106 | Quirino | province | Region II (Cagayan Valley) | F | 0205700000 | not started | |
| 107 | Abra | province | Cordillera Administrative Region (CAR) | F | 1400100000 | not started | |
| 108 | Kalinga | province | Cordillera Administrative Region (CAR) | F | 1403200000 | not started | |
| 109 | Mountain Province | province | Cordillera Administrative Region (CAR) | F | 1404400000 | not started | |
| 110 | Ifugao | province | Cordillera Administrative Region (CAR) | F | 1402700000 | not started | |
| 111 | Apayao | province | Cordillera Administrative Region (CAR) | F | 1408100000 | not started | |
| 112 | Zamboanga del Norte | province | Region IX (Zamboanga Peninsula) | F | 0907200000 | not started | |
| 113 | Zamboanga Sibugay | province | Region IX (Zamboanga Peninsula) | F | 0908300000 | not started | |
| 114 | Lanao del Sur | province | Bangsamoro Autonomous Region In Muslim Mindanao (BARMM) | F | 1903600000 | not started | |
| 115 | Basilan | province | Bangsamoro Autonomous Region In Muslim Mindanao (BARMM) | F | 1900700000 | not started | |
| 116 | Sulu | province | Bangsamoro Autonomous Region In Muslim Mindanao (BARMM) | F | 1906600000 | not started | |
| 117 | Tawi-Tawi | province | Bangsamoro Autonomous Region In Muslim Mindanao (BARMM) | F | 1907000000 | not started | |
| 118 | Carmen Cluster | municipality | Bangsamoro Autonomous Region In Muslim Mindanao (BARMM) | F | 1999901000 | not started | |
| 119 | Kabacan Cluster | municipality | Bangsamoro Autonomous Region In Muslim Mindanao (BARMM) | F | 1999902000 | not started | |
| 120 | Midsayap Cluster I | municipality | Bangsamoro Autonomous Region In Muslim Mindanao (BARMM) | F | 1999903000 | not started | |
| 121 | Midsayap Cluster II | municipality | Bangsamoro Autonomous Region In Muslim Mindanao (BARMM) | F | 1999904000 | not started | |
| 122 | Pigcawayan Cluster | municipality | Bangsamoro Autonomous Region In Muslim Mindanao (BARMM) | F | 1999905000 | not started | |
| 123 | Pikit Cluster I | municipality | Bangsamoro Autonomous Region In Muslim Mindanao (BARMM) | F | 1999906000 | not started | |
| 124 | Pikit Cluster II | municipality | Bangsamoro Autonomous Region In Muslim Mindanao (BARMM) | F | 1999907000 | not started | |
| 125 | Pikit Cluster III | municipality | Bangsamoro Autonomous Region In Muslim Mindanao (BARMM) | F | 1999908000 | not started | |

## Gaps in the three units in progress (2026-10-31)

- **Bohol**: no PDRRMO number found; only Loon has a municipal DRRMO number (from an image, digits to be checked by a person). Fire stations come
  from a 2015 provincial table (all not confirmed). No NHFR rows yet (needs the Region VII export), no barangay health stations, no confirmed
  evacuation centre, no coordinates.
- **South Cotabato**: PDRRMO hotlines confirmed; T'boli is the only municipality with its own MDRRMO line. Banga, Lake Sebu, Norala,
  Polomolok, Santo Niño, Surallah, Tampakan, Tantangan and Tupi carry the mayor's office number only (kind `other`).
- **General Santos City**: CDRRMO, ambulance, fire, police, Royeca Hospital and Red Cross read on official pages; no Coast Guard station, no
  evacuation centres, no barangay health station near Conel.
