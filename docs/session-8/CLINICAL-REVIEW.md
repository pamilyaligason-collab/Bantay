# Session 8 clinical review list

Text below is plain-language and non-diagnostic, but a clinician should read it before release. Append new items under your lane's heading.

## L1 labs (lab results list and detail)

Code: `src/features/health/labsLogic.ts` (`INFO`), shown on the lab detail page.

1. "What this test measures" lines for: LDL, HDL, total cholesterol, triglycerides, HbA1c, fasting glucose, eGFR, creatinine, hemoglobin, platelets, white blood cells, uric acid. Wording follows MedlinePlus lab-test pages (https://medlineplus.gov/lab-tests/). Check each is accurate and not alarming.
2. Two generic "questions to ask your doctor" per test, same map. Check they are sensible and neutral.
3. Neutral fallback line and questions for any test not in the map.
4. "Toward / away from the usual range" wording compares each result with the one before it, by distance to the range limits. It never says better or worse.
5. NOT added, needs clinician-supplied values: the dashed "many doctors are not concerned until ..." line from the mockup.
6. Reference ranges come from the lab printout, the family limit, or `guide-ranges.json` / the general guide in `ranges.ts`; no new ranges were added.


## Move (senior exercise) - for clinician review

Status: NOT reviewed. All text below was written by Bantay (no third-party exercise text or images). Nothing here is a diagnosis or a prescription. Please check every rule and every move.

### Rules (src/features/exercise/recommend.ts)

1. Gate: before anything else, EVERYONE sees "Check with your doctor before starting new exercise." and taps "I understand" once (stored on the phone). No picks until then.
2. Age 65 or more, or age unknown: level 1 moves only, balance and strength first, seated and supported moves ranked before others. Under 65: levels 1 and 2, strength first.
3. Age 80 or more: seated or standing-with-support moves only (no floor work).
4. Moves done in the last 7 days are ranked lower so the 3 picks change through the week.
5. Free-text conditions are matched by keyword, English and Tagalog: hypertension (hypertension, high blood, altapresyon), arthritis (arthritis, rayuma), diabetes (diabetes, asukal), heart (heart, puso), osteoporosis (osteopor), asthma (asthma, hika).
6. Hypertension: no move tagged "hold" (isometric holds); reminder to keep breathing and not hold breath. If the person has hypertension AND a blood pressure logged in the last 24 hours is above the app's general guide (top number over 119 or bottom number over 79, from src/data/guide-ranges.json, AHA), show "Rest today" and no moves. REVIEW: the guide cut-off is the AHA normal band, which is strict; confirm whether a higher cut-off (for example 160/100 or the person's own doctor target) is the right line for "rest today".
7. Diabetes: reminder to keep a small snack nearby. If a sugar logged in the last 24 hours is below 70 mg/dL (guide low), show "Rest today, eat something and recheck" and no moves. REVIEW: confirm the 70 mg/dL line and the wording.
8. Heart condition or osteoporosis: only walking and seated moves until the person taps "My doctor said OK" (stored on the phone). Osteoporosis also never gets forward-bend, floor or impact moves, even after "OK".
9. Arthritis: no deep-knee or impact moves; reminder that sharp joint pain is not fine.
10. Asthma: reminder to keep the inhaler within reach.
11. Weekly ring: last 7 days, minutes from walk logs and Move logs toward 150; days with a strength or balance move toward 2. A counted set (reps) is logged as about 2 minutes. REVIEW: confirm that counting all light moves toward the 150 minutes is acceptable.
12. Rest rules (6 and 7) only fire when the condition is listed in the person's profile (hypertension for blood pressure, diabetes for sugar). A high pressure or low sugar with no listed condition shows moves as normal. REVIEW: confirm this is acceptable or whether any person with a high reading should rest.
13. A person's own doctor-set limits (Health thresholds) replace the general guide in rules 6 and 7.
14. REVIEW, tags: "Sit to stand from a chair" (sit-to-stand) and "Slow chair stand" (chair-stand-slow) are tagged deep-knee, so arthritis never gets them. Confirm that is right, since sit-to-stand is also a common arthritis exercise. "Foot in front of foot, holding a chair" (tandem-stand) is tagged hold, so hypertension never gets it. Confirm that a 30-second balance stance counts as an isometric hold.
15. Sources: WHO 2020 and CDC older adults (docs/SOURCES.md).

### Moves (src/features/exercise/moves.json)

#### Sit to stand from a chair (sit-to-stand)
- Tagalog line: Tumayo mula sa upuan
- Group: strength; posture: seated; level 1; 8 repetitions
- Avoid tags: deep-knee
- Steps:
  1. Sit near the front of a sturdy chair, feet flat, hip-width apart.
  2. Lean forward a little and push through your feet to stand.
  3. Stand tall for a moment, then sit down slowly.
  4. Use your hands on the chair arms or your knees if you need to.
- Stop if: You feel dizzy or faint; Sharp pain (not just tired muscles); Chest pain or pressure

#### Slow chair stand (chair-stand-slow)
- Tagalog line: Dahan-dahang tayo
- Group: strength; posture: seated; level 2; 6 repetitions
- Avoid tags: deep-knee
- Steps:
  1. Sit at the front of a sturdy chair.
  2. Stand up slowly.
  3. Sit back down, taking 3 slow counts to lower.
- Stop if: You feel dizzy or faint; Sharp pain (not just tired muscles); Chest pain or pressure

#### Heel raises holding a counter (heel-raises)
- Tagalog line: Itaas ang takong
- Group: strength; posture: standing-with-support; level 1; 10 repetitions
- Avoid tags: none
- Steps:
  1. Stand behind a chair or at a counter, both hands on it.
  2. Rise up onto your toes slowly.
  3. Lower your heels slowly.
  4. Keep your knees soft, not locked.
- Stop if: You feel dizzy or faint; Sharp pain (not just tired muscles); Your calf cramps and does not ease

#### Toe raises holding a counter (toe-raises)
- Tagalog line: Itaas ang daliri ng paa
- Group: strength; posture: standing-with-support; level 1; 10 repetitions
- Avoid tags: none
- Steps:
  1. Stand with both hands on a counter or chair back.
  2. Lift the front of your feet, heels stay down.
  3. Lower slowly.
- Stop if: You feel dizzy or faint; Sharp pain (not just tired muscles)

#### Seated march (seated-march)
- Tagalog line: Pagmartsa habang nakaupo
- Group: strength; posture: seated; level 1; 60 seconds
- Avoid tags: none
- Steps:
  1. Sit tall near the front of a chair.
  2. Lift one knee, then lower it.
  3. Switch legs, like slow walking in place.
  4. Breathe normally.
- Stop if: You feel dizzy or faint; Chest pain or pressure; You cannot talk while you do it

#### Wall push-up (wall-push-up)
- Tagalog line: Push-up sa dingding
- Group: strength; posture: standing-with-support; level 1; 8 repetitions
- Avoid tags: none
- Steps:
  1. Face a wall, an arm's length away, hands on the wall at shoulder height.
  2. Bend your elbows to bring your chest toward the wall.
  3. Push back to straight arms, slowly.
  4. Keep your back straight.
- Stop if: Sharp pain (not just tired muscles); Shoulder pain; You feel dizzy or faint

#### Seated knee straightening (seated-knee-straighten)
- Tagalog line: Itaas ang tuhod habang nakaupo
- Group: strength; posture: seated; level 1; 10 repetitions
- Avoid tags: none
- Steps:
  1. Sit tall in a chair.
  2. Slowly straighten one knee until your leg is level.
  3. Lower it slowly. Do the other leg.
  4. Breathe out as you lift.
- Stop if: Sharp pain (not just tired muscles); Knee pain that gets worse

#### Seated leg lift with a hold (seated-leg-hold)
- Tagalog line: Itaas at hawakan ang binti
- Group: strength; posture: seated; level 2; 45 seconds
- Avoid tags: hold
- Steps:
  1. Sit tall in a chair.
  2. Straighten one knee and hold it level for 5 slow counts.
  3. Lower and switch legs.
  4. Keep breathing; do not hold your breath.
- Stop if: Sharp pain (not just tired muscles); You feel dizzy or faint

#### Seated arm raises (arm-raises)
- Tagalog line: Itaas ang mga braso
- Group: strength; posture: seated; level 1; 10 repetitions
- Avoid tags: none
- Steps:
  1. Sit tall, arms by your sides. Hold a small water bottle if you like.
  2. Lift both arms to the front, up to shoulder height.
  3. Lower slowly.
  4. Breathe out as you lift.
- Stop if: Shoulder pain; You feel dizzy or faint

#### Bottle curls (bottle-curl)
- Tagalog line: Pagbuhat ng bote
- Group: strength; posture: seated; level 1; 10 repetitions
- Avoid tags: none
- Steps:
  1. Sit tall holding a small water bottle in each hand.
  2. Bend your elbows to bring the bottles to your shoulders.
  3. Lower slowly.
- Stop if: Sharp pain (not just tired muscles); You feel dizzy or faint

#### Standing leg out to the side (side-leg-lift)
- Tagalog line: Ilabas ang binti sa gilid
- Group: strength; posture: standing-with-support; level 2; 8 repetitions
- Avoid tags: none
- Steps:
  1. Stand tall holding a counter or chair back.
  2. Slowly lift one leg out to the side, a small way.
  3. Lower it. Do the other leg.
  4. Keep your toes pointing forward.
- Stop if: You feel dizzy or faint; Sharp pain (not just tired muscles)

#### Hip bridge on the bed (hip-bridge)
- Tagalog line: Itaas ang balakang
- Group: strength; posture: floor; level 2; 8 repetitions
- Avoid tags: floor
- Steps:
  1. Lie on your back, knees bent, feet flat.
  2. Press your feet down and lift your hips a little.
  3. Lower slowly.
  4. Breathe out as you lift.
- Stop if: Sharp pain (not just tired muscles); You feel dizzy or faint; Back pain

#### March in place near a chair (march-in-place)
- Tagalog line: Martsa sa lugar
- Group: balance; posture: standing-with-support; level 1; 60 seconds
- Avoid tags: none
- Steps:
  1. Stand tall next to a sturdy chair, one hand on it.
  2. Lift one knee, then the other, at an easy pace.
  3. Swing your free arm.
  4. Slow down if you get out of breath.
- Stop if: You feel dizzy or faint; Chest pain or pressure; You cannot talk while you do it

#### Foot in front of foot, holding a chair (tandem-stand)
- Tagalog line: Isang paa sa harap ng isa
- Group: balance; posture: standing-with-support; level 1; 30 seconds
- Avoid tags: hold
- Steps:
  1. Stand next to a sturdy chair and hold it.
  2. Place one foot directly in front of the other, heel touching toes.
  3. Stay for up to 30 seconds. Switch feet.
  4. Keep breathing.
- Stop if: You feel dizzy or faint; You lose your balance and need to grab the chair

#### Stand on one foot holding a counter (one-foot-stand)
- Tagalog line: Tumayo sa isang paa
- Group: balance; posture: standing-with-support; level 2; 20 seconds
- Avoid tags: hold
- Steps:
  1. Hold a counter with both hands.
  2. Lift one foot a little off the floor.
  3. Stay for up to 20 seconds, then switch.
  4. Use one hand only when you feel steady.
- Stop if: You feel dizzy or faint; Sharp pain (not just tired muscles)

#### Weight shift side to side (weight-shift)
- Tagalog line: Ilipat ang bigat sa gilid
- Group: balance; posture: standing-with-support; level 1; 45 seconds
- Avoid tags: none
- Steps:
  1. Stand holding a counter, feet hip-width apart.
  2. Slowly shift your weight onto your right foot.
  3. Slowly shift to your left foot.
  4. Keep your hips level.
- Stop if: You feel dizzy or faint; Sharp pain (not just tired muscles)

#### Heel-to-toe steps along a counter (heel-toe-steps)
- Tagalog line: Hakbang na sunod-sunod
- Group: balance; posture: standing-with-support; level 2; 60 seconds
- Avoid tags: none
- Steps:
  1. Stand at the end of a counter, one hand on it.
  2. Step forward, placing your heel just in front of the other toes.
  3. Walk along the counter like this.
  4. Turn around and come back.
- Stop if: You feel dizzy or faint; You lose your balance

#### Seated reach to the side (seated-side-reach)
- Tagalog line: Abutin ang gilid
- Group: balance; posture: seated; level 1; 6 repetitions
- Avoid tags: none
- Steps:
  1. Sit tall in a sturdy chair, feet flat.
  2. Reach one arm out to the side, a small way.
  3. Return to the middle. Switch sides.
  4. Keep your hips on the seat.
- Stop if: You feel dizzy or faint; Sharp pain (not just tired muscles)

#### Ankle circles (ankle-circles)
- Tagalog line: Paikutin ang bukung-bukong
- Group: stretch; posture: seated; level 1; 60 seconds
- Avoid tags: none
- Steps:
  1. Sit in a chair and lift one foot a little.
  2. Draw slow circles with your toes, 5 each way.
  3. Switch feet.
- Stop if: Sharp pain (not just tired muscles); Cramping that does not ease

#### Seated hamstring stretch (hamstring-stretch)
- Tagalog line: Iunat ang likod ng hita
- Group: stretch; posture: seated; level 1; 60 seconds
- Avoid tags: forward-bend, hold
- Steps:
  1. Sit at the front edge of a chair.
  2. Straighten one leg, heel on the floor, toes up.
  3. Sit tall and lean forward a little from the hip until you feel a gentle pull.
  4. Stay for 20 seconds, breathing normally. Switch legs.
- Stop if: Pain (a gentle pull is fine); You feel dizzy or faint

#### Shoulder rolls (shoulder-rolls)
- Tagalog line: Paikutin ang balikat
- Group: stretch; posture: seated; level 1; 45 seconds
- Avoid tags: none
- Steps:
  1. Sit tall with arms relaxed.
  2. Roll your shoulders up, back and down in a slow circle, 5 times.
  3. Roll them the other way, 5 times.
- Stop if: Shoulder pain

#### Gentle neck turns (neck-turns)
- Tagalog line: Dahan-dahang paglingon
- Group: stretch; posture: seated; level 1; 45 seconds
- Avoid tags: none
- Steps:
  1. Sit tall and look straight ahead.
  2. Slowly turn your head to the right as far as is comfortable.
  3. Come back to the middle, then turn left.
  4. Do not tip your head back.
- Stop if: You feel dizzy or faint; Pain or tingling in your arms

#### Hand and wrist stretch (hand-wrist-stretch)
- Tagalog line: Iunat ang kamay at pulso
- Group: stretch; posture: seated; level 1; 45 seconds
- Avoid tags: none
- Steps:
  1. Hold one arm out in front, palm up.
  2. With the other hand, gently bend the fingers down toward the floor.
  3. Stay 10 seconds. Switch hands.
  4. Open and close your fists 10 times.
- Stop if: Pain or numbness

#### Calf stretch at a wall (calf-stretch)
- Tagalog line: Iunat ang binti sa dingding
- Group: stretch; posture: standing-with-support; level 1; 60 seconds
- Avoid tags: hold
- Steps:
  1. Stand facing a wall, hands on it.
  2. Step one foot back, heel down.
  3. Bend the front knee a little until you feel a gentle pull in the back leg.
  4. Stay for 20 seconds. Switch.
- Stop if: Sharp pain (not just tired muscles); You feel dizzy or faint

#### Seated chest opener (chest-opener)
- Tagalog line: Buksan ang dibdib
- Group: stretch; posture: seated; level 1; 45 seconds
- Avoid tags: none
- Steps:
  1. Sit tall at the front of the chair.
  2. Hold the chair back behind you, or rest your hands on your hips.
  3. Gently lift your chest and breathe in.
  4. Breathe out and relax.
- Stop if: Shoulder pain; You feel dizzy or faint

#### Easy 5-minute walk (walk-5)
- Tagalog line: Maglakad ng 5 minuto
- Group: walk; posture: standing-with-support; level 1; 300 seconds
- Avoid tags: none
- Steps:
  1. Choose a flat, even place, indoors or in the shade.
  2. Walk at a pace where you can still talk.
  3. Wear shoes that fit and grip.
  4. Stop and sit if you need a rest.
- Stop if: You feel dizzy or faint; Chest pain or pressure; You cannot talk while you do it; Sharp pain (not just tired muscles)

#### Easy 10-minute walk (walk-10)
- Tagalog line: Maglakad ng 10 minuto
- Group: walk; posture: standing-with-support; level 2; 600 seconds
- Avoid tags: none
- Steps:
  1. Choose a flat, even place.
  2. Walk at a pace where you can still talk.
  3. Bring water if it is warm.
  4. Stop and sit if you need a rest.
- Stop if: You feel dizzy or faint; Chest pain or pressure; You cannot talk while you do it; Sharp pain (not just tired muscles)

#### Indoor walk back and forth (indoor-walk)
- Tagalog line: Lakad sa loob ng bahay
- Group: walk; posture: standing-with-support; level 1; 300 seconds
- Avoid tags: none
- Steps:
  1. Pick a clear path at home with a wall or furniture to touch.
  2. Walk to the end and back.
  3. Keep a steady, easy pace.
  4. Sit down if you feel tired.
- Stop if: You feel dizzy or faint; Chest pain or pressure; You cannot talk while you do it; Sharp pain (not just tired muscles)

#### Slow breathing (slow-breathing)
- Tagalog line: Mabagal na paghinga
- Group: breathe; posture: seated; level 1; 120 seconds
- Avoid tags: none
- Steps:
  1. Sit comfortably with your back supported.
  2. Breathe in through your nose for about 4 counts.
  3. Breathe out gently through your mouth for about 6 counts.
  4. Keep going for 2 minutes. Never hold your breath.
- Stop if: You feel dizzy or faint; Your chest feels tight

#### Belly breathing (belly-breathing)
- Tagalog line: Paghinga gamit ang tiyan
- Group: breathe; posture: seated; level 1; 120 seconds
- Avoid tags: none
- Steps:
  1. Sit back and rest one hand on your belly.
  2. Breathe in slowly so your belly rises.
  3. Breathe out slowly so it falls.
  4. Repeat for 2 minutes.
- Stop if: You feel dizzy or faint

#### Pursed-lip breathing (pursed-lip-breathing)
- Tagalog line: Paghingang parang sisipol
- Group: breathe; posture: seated; level 1; 120 seconds
- Avoid tags: none
- Steps:
  1. Sit comfortably.
  2. Breathe in through your nose for 2 counts.
  3. Purse your lips like blowing out a candle and breathe out slowly for 4 counts.
  4. Repeat for 2 minutes.
- Stop if: You feel dizzy or faint; You feel worse


## Videos (src/data/videos.json) - titles for wording review

The six official health videos' titles, as shown in the app (the videos themselves are from their publishers on YouTube):

1. Hands-only CPR
2. BE FAST: signs of a stroke
3. Heat exhaustion and heatstroke
4. Diabetic emergency: what to do
5. Five a day: eating more fruit and vegetables
6. Lusog-Isip: looking after your mental health

## W2 Safety: Act early first-aid pages

Code: `src/features/safety/firstaid.json` (17 topics, shown at `#safety/firstaid/<id>`). All steps and "Call 911 when" lines are Bantay's own words, written from general knowledge of the linked guidance, NOT copied from fetched pages. Footer on every page: "General first-aid guidance, not a diagnosis." Please check each topic against its linked source and Philippine practice (for example 911, Animal Bite Treatment Centres, paracetamol only).

1. Stroke (BE FAST): signs, "note the time", no food, drink or pills.
2. Dengue warning signs: warning-sign list, "watch when the fever goes down, usually day 3 to 7", paracetamol only if a doctor agrees, avoid aspirin and ibuprofen. REVIEW: wording of the "go at once" list and the paracetamol line.
3. CPR (hands-only): about 2 pushes per second, at least 5 cm deep.
4. Choking (adult): 5 back blows then 5 inward-upward belly pushes, alternate; CPR if they pass out.
5. Heavy bleeding: direct pressure, no tourniquet advice, "10 minutes of pressure" as a call-911 line. REVIEW: the 10-minute figure is our own choice.
6. Heart attack: signs, "do not drive yourself", "help them take prescribed chest-pain medicine as directed". Aspirin is deliberately NOT mentioned. REVIEW: confirm omission.
7. Burns: cool running water 20 minutes, no ice or home remedies, cover loosely, paracetamol for pain. REVIEW: the call-911 size rule ("bigger than the person's hand").
8. Heat stroke: cooling steps and small sips only if fully awake.
9. Seizure: time it, protect the head, nothing in the mouth, recovery position, call at 5 minutes.
10. Fainting: flat, legs raised about 30 cm, call if no wake in a minute. REVIEW: the one-minute figure.
11. Broken bone: keep still, cold pack, nothing to eat or drink.
12. Drowning: reach or throw, CPR starting with 5 rescue breaths, hospital even if they recover. REVIEW: rescue-breath advice for lay people.
13. Snake bite: still limb at heart level, no cutting, sucking, tourniquet or ice.
14. Dog or cat bite: wash 15 minutes with soap and water, "Go to an Animal Bite Treatment Centre the same day".
15. Low blood sugar: 3 teaspoons of sugar in water or half a glass of juice, repeat after 15 minutes. REVIEW: the amounts are ours.
16. Severe allergic reaction: prescribed adrenaline pen in the outer thigh, call 911.
17. After a fall: do not rush to lift, check pain and confusion, roll to side and up via hands and knees, call if head strike on a blood thinner.

Sources still UNVERIFIED as web pages: the DOH rabies video (AaL7zL5S7Ww) and the AHA videos (M4ACYp75mjU, C8EO3SM0Y_w) were checked by YouTube oEmbed only; no AHA or DOH web page is linked. The NHS epilepsy page (linked for Seizure) was opened but its seizure first-aid section was not read line by line.

### W2 Safety: full first-aid text for clinician review (copied from src/features/safety/firstaid.json)

#### Stroke (BE FAST) (stroke)
Steps:
1. Check Balance, Eyes, Face, Arms, Speech. Sudden trouble in any one is a warning.
2. Face: ask them to smile. Does one side droop? Arms: ask them to lift both. Does one drift down?
3. Speech: ask them to say a short sentence. Is it slurred or strange?
4. Note the time the signs began and tell the 911 operator.
5. Keep them still and comfortable. Give no food, drink or pills.

Call 911 when:
- Any one BE FAST sign, even if it fades
- Sudden severe headache, or sudden confusion
- Do not wait to see if it passes

Sources: https://www.nhs.uk/conditions/stroke/symptoms/, https://www.who.int/news-room/fact-sheets/detail/stroke

#### Dengue warning signs (dengue-warning-signs)
Steps:
1. Fever for 2 to 7 days with body pain or headache can be dengue. Rest and sip fluids often.
2. Watch closely when the fever goes down, usually on day 3 to 7. This is when it can turn serious.
3. Go to a clinic or hospital at once for belly pain, repeated vomiting, bleeding gums or nose, black stool, or cold clammy skin.
4. Also go if the person is very sleepy, restless, or breathing fast.
5. Use paracetamol for fever only if a doctor agrees. Avoid aspirin and ibuprofen.

Call 911 when:
- Cannot stay awake, or is confused
- Severe belly pain or vomiting that will not stop
- Bleeding that will not stop, or vomiting blood
- Cold, clammy, pale skin, or trouble breathing

Sources: https://www.who.int/news-room/fact-sheets/detail/dengue-and-severe-dengue, https://www.nhs.uk/conditions/dengue/

#### CPR (hands-only) (cpr)
Steps:
1. Check the person: no answer and not breathing normally. Shout for help.
2. Call 911, or ask someone to call and bring an AED if there is one.
3. Kneel beside them. Put the heel of one hand on the middle of the chest, the other hand on top.
4. Push hard and fast, about 2 pushes every second, at least 5 cm deep. Let the chest come back up each time.
5. Keep going without stopping until help or an AED arrives, or they wake up.

Call 911 when:
- Always: call 911 first for anyone who will not wake and is not breathing normally

Sources: https://www.redcross.org/take-a-class/cpr/performing-cpr/cpr-steps, https://www.youtube.com/watch?v=aks4waFy5yU

#### Choking (adult) (choking)
Steps:
1. Ask: are you choking? If they can cough, let them cough.
2. If they cannot cough, speak or breathe, call 911 or have someone call.
3. Lean them forward. Give 5 firm blows on the back between the shoulder blades.
4. If still stuck, give 5 quick inward and upward pushes just above the belly button.
5. Alternate 5 back blows and 5 belly pushes until it clears or they pass out. If they pass out, start CPR.

Call 911 when:
- They cannot cough, speak or breathe
- They pass out
- Anything is still stuck after the first round

Sources: https://www.youtube.com/watch?v=8R3RWC-xx1I

#### Heavy bleeding (bleeding)
Steps:
1. Call 911 if the blood is spurting, soaking through, or will not stop.
2. Press hard directly on the wound with a clean cloth or your gloved hand.
3. Keep pressing. Do not lift to peek. Add more cloth on top if it soaks through.
4. Once it slows, wrap a firm bandage over the pad. Not so tight that fingers turn pale or numb.
5. Lay the person down and keep them warm until help arrives.

Call 911 when:
- Blood spurts or soaks through a thick pad
- Bleeding does not slow after 10 minutes of pressure
- The person is pale, faint or confused
- A deep wound on the head, chest or belly

Sources: https://www.youtube.com/watch?v=caPHddkuT4M, https://www.youtube.com/watch?v=YJB3fI3T1oo

#### Heart attack (heart-attack)
Steps:
1. Signs: pressure or squeezing in the chest, pain spreading to the arm, jaw or back, sweating, breathlessness, nausea.
2. Call 911 right away. Do not drive yourself.
3. Sit the person down and keep them calm and still.
4. If a doctor has prescribed chest-pain medicine, help them take it as directed.
5. If they stop responding and are not breathing normally, start CPR.

Call 911 when:
- Chest pain or pressure lasting more than a few minutes
- Pain with sweating, breathlessness or feeling faint
- Any time you are unsure: call

Sources: https://www.nhs.uk/conditions/heart-attack/

#### Burns (burns)
Steps:
1. Move away from the heat. Remove rings, watches and tight clothing near the burn before it swells.
2. Cool the burn under cool running water for 20 minutes. Not ice.
3. Do not pop blisters. Do not put toothpaste, oil or butter on it.
4. Cover loosely with a clean non-fluffy cover, such as kitchen cling film or a clean cloth.
5. Keep the person warm. Give paracetamol for pain if they can normally take it.

Call 911 when:
- Burn bigger than the person's hand, or on the face, hands, feet or private parts
- Deep burn, white, brown or charred skin
- Burn from electricity or chemicals
- Trouble breathing after smoke, or a burn in a baby or older adult

Sources: https://www.nhs.uk/conditions/burns-and-scalds/

#### Heat stroke (heat-stroke)
Steps:
1. Signs: very hot skin, confusion, fainting, a fast pulse, headache. Sweating may stop.
2. Call 911. Heat stroke is an emergency.
3. Move them into shade or a cool room. Remove extra clothing.
4. Cool the body fast: wet skin with cool water and fan, or put cool wet cloths on neck, armpits and groin.
5. If fully awake, give small sips of cool water. Do not force fluids.

Call 911 when:
- Confused, very sleepy or fainting
- Hot skin with no sweat
- A seizure, or not getting better in 15 minutes

Sources: https://www.nhs.uk/conditions/heat-exhaustion-heatstroke/

#### Seizure (seizure)
Steps:
1. Stay calm and note the time it started.
2. Clear hard or sharp things away. Cushion their head with something soft.
3. Do not hold them down. Never put anything in their mouth.
4. When shaking stops, roll them gently onto their side.
5. Stay with them until fully awake. Speak softly and tell them what happened.

Call 911 when:
- It lasts more than 5 minutes
- A second seizure follows, or they do not wake up
- First seizure ever, or an injury, pregnancy, or trouble breathing afterwards

Sources: https://www.nhs.uk/conditions/epilepsy/, https://www.youtube.com/watch?v=7MPJauo4DdY

#### Fainting (fainting)
Steps:
1. Lay the person flat on their back. Raise their legs about 30 cm if you can.
2. Loosen tight collars and belts. Give them air and space.
3. If they are breathing and do not wake within a minute, roll them onto their side and call 911.
4. When they wake, keep them lying down for a few minutes. Sit up slowly.
5. Give water once fully alert. Do not give food or drink to someone who is not awake.

Call 911 when:
- Does not wake within a minute
- Chest pain, trouble breathing or a very uneven heartbeat
- Injured in the fall, pregnant, or a first-ever faint in an older adult
- Faints again

Sources: https://www.nhs.uk/symptoms/fainting/

#### Broken bone (fracture)
Steps:
1. Keep the person still. Do not try to straighten the bone.
2. Support the injured part in the position you found it, with rolled clothes or a pillow.
3. Cover any open wound with a clean cloth. Press around it, not on the bone.
4. Put a cold pack wrapped in cloth on it for pain and swelling.
5. Do not let them eat or drink in case they need an operation. Get them to a hospital.

Call 911 when:
- Bone through the skin, or heavy bleeding
- Neck, back or head injury
- Leg or hip injury they cannot move
- Numb, pale or blue fingers or toes below the injury

Sources: https://www.youtube.com/watch?v=IPlazeozEOU

#### Drowning (drowning)
Steps:
1. Shout for help and call 911. Reach or throw something that floats. Do not swim out unless trained.
2. Once out of the water, check if they wake and breathe normally.
3. If not breathing, lay them flat and start CPR. Begin with 5 rescue breaths if you know how.
4. Keep going until help arrives.
5. If they wake, lay them on their side, keep them warm, and still go to a hospital.

Call 911 when:
- Always call 911 for any drowning, even if they seem fine afterwards
- Coughing, trouble breathing or sleepiness hours later

Sources: https://www.who.int/news-room/fact-sheets/detail/drowning

#### Snake bite (snake-bite)
Steps:
1. Move away from the snake. Keep the person calm and still. Moving speeds the venom.
2. Call 911 or get to a hospital quickly.
3. Keep the bitten limb still and at about heart level. Take off rings and tight items.
4. Do not cut the bite, suck it, use a tourniquet, or apply ice.
5. Note what the snake looked like if safe. Do not try to catch it.

Call 911 when:
- Every snake bite is an emergency
- Swelling spreading, drooping eyelids, trouble breathing or speaking

Sources: https://www.who.int/news-room/fact-sheets/detail/snakebite-envenoming

#### Dog or cat bite (rabies) (dog-bite-rabies)
Steps:
1. Wash the bite or scratch right away with soap and running water for 15 minutes.
2. Put on a clean cover. Do not close a deep wound tightly.
3. Go to an Animal Bite Treatment Centre the same day. Rabies shots work only if started early.
4. Do not wait to see if the animal stays healthy. Do not use herbs, garlic or stones.
5. Tell the doctor about the animal and any past tetanus shot.

Call 911 when:
- Bleeding that will not stop
- Bite on the face, head or neck
- Fever, confusion or fear of water after any animal bite

Sources: https://www.who.int/news-room/fact-sheets/detail/rabies, https://www.youtube.com/watch?v=_hchkrLTr98

#### Low blood sugar (low-sugar)
Steps:
1. Signs: shaky, sweaty, hungry, pale, confused, or acting oddly. Think of it if they have diabetes.
2. If they can swallow safely, give fast sugar: 3 teaspoons of sugar in water, or half a glass of juice.
3. Wait 15 minutes. Check sugar if you have a meter.
4. If still low or symptoms stay, give the sugar again.
5. Once better, give a snack such as bread or biscuits.

Call 911 when:
- They are too drowsy to swallow safely
- They pass out or have a seizure
- Not better after two rounds of sugar

Sources: https://www.nhs.uk/conditions/low-blood-sugar-hypoglycaemia/

#### Severe allergic reaction (allergic-reaction)
Steps:
1. Signs: swollen lips or face, hives, wheezing, throat tightness, dizziness, or vomiting after food, a sting or medicine.
2. Call 911 right away.
3. If they have a prescribed adrenaline pen, help them use it at once, in the outer thigh.
4. Lay them flat with legs raised. If they struggle to breathe, let them sit up.
5. Stay with them. Follow the pen instructions if a second dose is needed.

Call 911 when:
- Trouble breathing or a tight throat
- Swelling of the face or tongue
- Feeling faint or collapsing

Sources: https://www.nhs.uk/conditions/anaphylaxis/

#### After a fall (falls)
Steps:
1. Do not rush to pull them up. Ask where it hurts and stay calm.
2. Check for head, neck, back, hip or wrist pain, bleeding, or confusion.
3. If none of those and they feel able, help them roll to the side, then up to hands and knees and onto a sturdy chair.
4. If they cannot get up, keep them warm with a blanket and call for help.
5. Tell their doctor about any fall, even without injury.

Call 911 when:
- Hit the head, especially on a blood thinner
- Cannot move, or hip, back or neck pain
- Confused, bleeding badly, or chest pain

Sources: https://www.nhs.uk/conditions/falls/


## W2 Safety: IDs and insurance row

"{n} saved" counts distinct ID and insurance cards stored on this phone plus Drive-only cards. With none: "Add your PhilHealth, Senior ID, HMO". No health text.


## Family: member report, learning hub, Memories (wave 2, lane W2-family)

For a clinician or a careful reader to check. Nothing here diagnoses or gives dosing advice; suggestions are questions to ask a doctor.

### Report: verdict words (src/features/family/reportLogic.ts)

Shown beside each vital, from the guide ranges (family limit, then the lab's own, then the guide):

- Above the usual range: "A bit high"
- Below the usual range: "A bit low"
- Within: "Usual"
- No range or a unit that cannot be compared: "No range to compare" (never "Usual")
- Blood pressure is one card, judged by the worse of the top and bottom numbers.
- Labs outside the range are listed under "Labs to ask about" with the words "High" or "Low".

### Report: things to bring up (generated questions)

Numbered, up to 8, in this order. Templates (the bracketed parts are filled from the person's own data):

1. For each vital outside its range: "My [blood pressure / blood sugar / pulse / weight] was [a bit high / a bit low] on [date]. What should I do about it?"
2. For each lab outside its range: "[Test name] was [high / low] on [date]. " followed by the first question already reviewed for that lab in labsLogic.ts (the lab question list above).
3. If any dose was missed in the last 7 days: "Some doses were missed this week ([up to 3 medicine names]). Can the times, or the way I take them, be made easier?"
4. Then the person's own saved questions (visits.questions.<person>), unchanged.

Footer under the list: "Questions to ask, made by Bantay from the numbers above and your saved questions. Not medical advice."

Review asks: is "A bit high" / "A bit low" right for older adults, or too soft? Should a very high blood pressure or sugar say "see a doctor soon" instead of the same wording? (Today it does not; the alert rules elsewhere in the app handle urgent values.)

### Report: medicine doses

Seven day cells: a day is "all taken", "missed" (any dose not taken or skipped on a past day), "still to take" (today, doses still open) or "none due". The line reads "Missed: [medicine] on [day]". The count "x of y doses" leaves out today's open doses. Review ask: should a deliberately skipped dose count as missed? Today it does.

### People list line

"[n] to check" or "All up to date", counting vitals out of range, labs out of range, and one for "missed doses this week". No numbers. Nothing is shown for a person this phone has no data for.

### Learning hub (src/features/family/hub.json)

Own-words titles and blurbs on cards that link to the sources named in docs/SOURCES.md:

- Stress: "Feeling stressed? What helps" - "What stress does to the body, and small things that ease it." (NIMH link)
- Sleep: "Sleeping better" - "Why sleep matters, and habits that make it easier to rest." (MedlinePlus link)
- Mental health: "Lusog-Isip: caring for your mind" - "How the Lusog-Isip app helps with self-care."; "Coping with stress" - "Ways to cope when things feel like too much."; "Mental health awareness" - "Why mental health is part of staying well." (DOH Philippines videos)
- Move and eat well: "How much is five a day?" - "A quick look at what counts as a portion of fruit and vegetables." (NHS video); "Healthy diet: the basics" - "The World Health Organization's short guide to eating well." (WHO link only)

Review ask: the three DOH video titles come from their YouTube titles ("Mental Health - Cope up with stress", "Mental Health Awareness"); watch them once to confirm they suit older users and nothing in them needs a caution.

### Memories

Privacy text on the card: "Only your family on Bantay sees these. Location and camera details are removed from every photo." Not a health text; listed so the claim can be checked against the code (canvas re-encode, 0023 policies).


## W3 Nutrition (food, salt and water) - for clinician review

Status: NOT reviewed. All wording below was written by Bantay. Nothing here is a diagnosis or a prescription. Code: `src/features/nutrition/` (rules in `logic.ts`), data in `src/features/nutrition/foods.json` (USDA FoodData Central, see docs/SOURCES.md).

### Targets

1. Daily sodium limit: default 2000 mg, option 1500 mg, chosen on Health > Food and salt by the person or a carer who can write for them. 2000 mg is the WHO adult ceiling (https://www.who.int/news-room/fact-sheets/detail/salt-reduction). REVIEW: confirm 1500 mg is the right lower option (AHA names 1500 mg as the ideal limit for most adults and 2300 mg as the upper limit), and whether people on dialysis or with heart failure need a different default.
2. Salt in grams = sodium in mg x 2.5 / 1000 (2000 mg is 5 g). Shown with one decimal.
3. Water goal: 1500 ml a day by default, 250 ml a glass. REVIEW: a fixed 1500 ml is wrong for people on a fluid limit (heart failure, advanced kidney disease). The app has no screen to change or hide the water goal yet (the column is editable in the database only). Decide whether to add "ask your doctor about fluids" wording or an off switch.
4. Calories, protein and potassium are stored and calories are shown as information only. There is NO calorie goal, no weight advice and no "good" or "bad" food label. Potassium is stored but not shown (people on some kidney or blood-pressure medicines are told to limit it; REVIEW before ever showing it).

### Wording (exact text on screen)

5. Bands, by share of the person's own limit: "Under" below 80%, "Near" from 80% up to the limit, "Over" at the limit or more. Each has a word, an icon and a colour. Lines under the bar: "Under your limit", "Close to your limit", "Over your limit", then "your limit is N mg sodium, about X g of salt." REVIEW: confirm "Over" is not alarming for older readers and that 80% is a sensible "Near".
6. "Ask your doctor about your salt limit" with "The WHO says adults should have less than 2000 mg of sodium a day (about 5 g of salt)." and the WHO link, next to the limit buttons.
7. "Salt can raise blood pressure in some people. These two charts share the same 7 days so you can look at them together. This is not a diagnosis; talk to your doctor." (under the week's sodium chart and the blood pressure chart). The app draws no conclusion from the two charts.
8. "Food numbers come from USDA FoodData Central and are estimates for a typical serving. A packaged food label is more exact." Every food is flagged `estimate` in the data until its numbers are checked against the FDC API.
9. "Saltiest today" lists the 3 foods with the most sodium that day. "N foods have no salt number, so the total may be low" appears when a logged food has no sodium value (unknown is never counted as 0).
10. The salty one-tap items (patis, toyo, bagoong, tuyo, instant noodles) show their mg per serving on the button. REVIEW: serving sizes (1 tbsp, 3 small tuyo, 1 pack of instant noodles) and the numbers, especially bagoong, tuyo and instant noodles, which vary a lot by brand.

### Not built

11. No photo or AI estimation of food. No barcode lookup (Open Food Facts was optional and skipped). No third-party calls from the app.
12. Usage analytics record only the fixed event names meal_logged, water_logged and salt_goal_set. A food name is never logged (rule B-7).

## Session 9, W2-HEALTH: the Health nudge card

These are friendly habit goals, not clinical thresholds. No reading is judged here (the verdict words still come from the shared range code).

13. Weekly goals on the card: blood pressure on 3 different days, sugar on 3 different days (only if the person has a sugar reading), meals logged on 4 days, all scheduled doses taken within 2 hours, and 150 minutes of movement. Basis: WHO Guidelines on physical activity and sedentary behaviour (2020), 150 minutes a week for adults and older adults; AHA "Monitoring Your Blood Pressure at Home" (daily morning and evening readings are advised for the week before a doctor visit, not as a permanent rule). REVIEW: 3 days a week for BP and sugar is an app-chosen starter habit; confirm it is not read as "enough" for someone whose doctor asked for more.
14. Wording: a goal with nothing yet says "Not yet this week", never "0". A running streak shows only when it is 1 day or more. No red, no "missed" or "failed" wording. A met goal says "Done this week".
15. The card only offers a button to log for yourself or for someone you may log for; otherwise it shows the rings read-only.
