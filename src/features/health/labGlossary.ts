/** Lab glossary: the ONE source for what a lab test is, used by the lab detail page, the Health attention card and the Library (wiki) articles.
 *  Plain-language paraphrase of MedlinePlus lab-test pages (NIH, U.S. National Library of Medicine; https://medlineplus.gov/lab-tests/), one cited URL per test.
 *  Nothing here diagnoses or changes treatment. FOR CLINICIAN REVIEW (docs/session-8/CLINICAL-REVIEW.md). Keys are the codes in scripts/import/test-catalog.json. */
export interface LabEntry {
  code: string
  loinc?: string // LOINC code: MedlinePlus Connect finds a lab by code only (checked live 2026-11-09)
  topic?: string // id of the closest curated topic (src/data/medlib/topics.json): the "related condition"
  name: string
  aliases: string[] // other spellings a paper or import may use (matched case-blind, letters and digits only)
  organ: string // what it reflects, 2 to 4 words: the first half of the Health "needs attention" line
  short: string // one line under the test name on lists and the detail page
  what: string // What it is
  high: string // what a high result can mean
  low: string // what a low result can mean
  affects: string[] // things that can affect it
  ask: string[] // questions for the doctor
  url: string // MedlinePlus page this was paraphrased from
}

const ML = 'https://medlineplus.gov/lab-tests/'
const NOT_ALARM = 'A result outside the range does not mean you have a condition.'

export const LAB_GLOSSARY: LabEntry[] = [
  {
    code: 'alt', loinc: '1742-6', topic: 'fattyliver', name: 'ALT (SGPT)', aliases: ['sgpt', 'alt/sgpt', 'alanine aminotransferase'], organ: 'Liver enzyme', short: 'An enzyme that mostly sits inside liver cells',
    what: 'ALT is an enzyme found mostly in the liver. A small amount is normally in the blood. It is often checked with other liver tests.',
    high: 'It can rise when liver cells are irritated or damaged, for example by some medicines or supplements, a liver infection or disease, or poor blood flow to the liver. A mild rise is common and often not serious. ' + NOT_ALARM,
    low: 'A low ALT is uncommon and is usually not a concern on its own.',
    affects: ['Medicines and supplements, including common ones', 'Hard exercise before the blood draw', 'Age, sex and body weight', 'Fasting, if the lab asked you to'],
    ask: ['Could any of my medicines or supplements raise my ALT?', 'Should I repeat this test, and do I need other liver tests?'],
    url: `${ML}alt-blood-test/`
  },
  {
    code: 'ast', loinc: '1920-8', topic: 'fattyliver', name: 'AST (SGOT)', aliases: ['sgot', 'ast/sgot', 'aspartate aminotransferase'], organ: 'Liver and muscle enzyme', short: 'An enzyme in the liver, heart and muscles',
    what: 'AST is an enzyme found mostly in the liver, and also in the heart, muscles and other tissues. It is usually read together with other liver tests.',
    high: 'It can rise when the liver or another tissue that holds AST is irritated or damaged, for example by some medicines, alcohol, a liver illness or a muscle or heart problem. ' + NOT_ALARM,
    low: 'A low AST is usually considered normal.',
    affects: ['Hard exercise', 'Certain medicines and alcohol', 'Pregnancy', 'Age and sex'],
    ask: ['Could my AST be high from a medicine, alcohol or exercise?', 'Should I repeat this test, and do I need other liver tests?'],
    url: `${ML}ast-test/`
  },
  {
    code: 'creatinine', loinc: '2160-0', topic: 'ckd', name: 'Creatinine', aliases: ['crea', 'createnine', 'serum creatinine'], organ: 'Kidney waste product', short: 'A waste product the kidneys remove',
    what: 'Creatinine is a waste product from normal muscle use. Healthy kidneys filter it out of the blood, so it helps show how well the kidneys are working.',
    high: 'It can be high when the kidneys are filtering less well. Dehydration, a very hard workout, a muscle injury or a lot of meat in the diet can also push it up for a while. ' + NOT_ALARM,
    low: 'A low creatinine is uncommon. It can go with low muscle mass or poor nutrition.',
    affects: ['How much muscle you have, and your age', 'Eating a lot of meat just before the test', 'Dehydration and hard exercise', 'Some medicines and supplements'],
    ask: ['Is my creatinine a concern for my kidneys?', 'Should I drink more water, or take anything differently?'],
    url: `${ML}creatinine-test/`
  },
  {
    code: 'egfr', loinc: '33914-3', topic: 'ckd', name: 'eGFR', aliases: ['gfr', 'estimated gfr'], organ: 'Kidney filtering score', short: 'How well the kidneys filter your blood',
    what: 'eGFR is an estimate of how well your kidneys filter waste from your blood. It is worked out from your creatinine, age and sex, so a higher number is better.',
    high: 'A high eGFR is usually not a concern.',
    low: 'A lower eGFR means the kidneys may be filtering less well. Doctors usually repeat it and look at other results before deciding what it means. ' + NOT_ALARM,
    affects: ['Muscle mass and body size', 'Eating a lot of meat before the test', 'Age and sex', 'Some medicines'],
    ask: ['What does my kidney score mean for me?', 'Are any of my medicines a concern for my kidneys?'],
    url: `${ML}glomerular-filtration-rate-gfr-test/`
  },
  {
    code: 'bun', loinc: '3094-0', topic: 'ckd', name: 'Blood urea nitrogen', aliases: ['blood urea nitrogen', 'urea nitrogen', 'urea'], organ: 'Kidney waste product', short: 'A waste product from breaking down protein',
    what: 'BUN is the urea nitrogen in your blood, a waste product from breaking down protein. Healthy kidneys remove it in urine.',
    high: 'It can be high when the kidneys are filtering less well, but also with dehydration, a high-protein diet or some medicines. ' + NOT_ALARM,
    low: 'It can be low with a low-protein diet, poor nutrition or, less often, a liver problem.',
    affects: ['How much water you have had', 'How much protein you eat', 'Some medicines', 'Age (it tends to rise with age)'],
    ask: ['Is my BUN a concern, or could it be dehydration or diet?', 'Should this be checked together with my creatinine?'],
    url: `${ML}bun-blood-urea-nitrogen/`
  },
  {
    code: 'uric_acid', loinc: '3084-1', topic: 'gout', name: 'Uric acid', aliases: ['uricacid', 'bua'], organ: 'Waste product, joints', short: 'A waste product that can collect in joints',
    what: 'Uric acid is a waste product made when the body breaks down purines, found in some foods. The kidneys remove most of it. Too much can collect in joints.',
    high: 'It can be high with gout, with kidneys that clear it slowly, or after a diet rich in purines such as red meat, some seafood and alcohol. ' + NOT_ALARM,
    low: 'A low blood uric acid is uncommon and is usually harmless.',
    affects: ['Foods high in purines, and alcohol', 'Medicines such as aspirin and water pills', 'Niacin (vitamin B3)'],
    ask: ['Is my uric acid a concern for my joints or kidneys?', 'Are there foods I should limit?'],
    url: `${ML}uric-acid-test/`
  },
  {
    code: 'fasting_glucose', loinc: '1558-6', topic: 'diabetes2', name: 'Fasting glucose', aliases: ['fbs', 'fasting blood sugar', 'glucose fasting'], organ: 'Blood sugar', short: 'Blood sugar after not eating for hours',
    what: 'Fasting glucose is the sugar in your blood after at least 8 hours without food. It shows how well the body handles sugar.',
    high: 'It can be high with prediabetes or diabetes. Illness, stress and some medicines such as steroids can also raise it for a while. ' + NOT_ALARM,
    low: 'It can be low with diabetes medicines, not eating enough or extra activity. Some other conditions and alcohol can also lower it.',
    affects: ['Whether you really fasted', 'Medicines (steroids can raise it, some others lower it)', 'Recent illness or stress', 'Recent meals or exercise'],
    ask: ['Is my fasting sugar where you want it?', 'How often should I check at home?'],
    url: `${ML}blood-glucose-test/`
  },
  {
    code: 'random_glucose', loinc: '2345-7', topic: 'diabetes2', name: 'Random glucose', aliases: ['rbs', 'random blood sugar', 'glucose random', 'glucose'], organ: 'Blood sugar', short: 'Blood sugar at any time of day',
    what: 'Random glucose is the sugar in your blood at any time, even soon after eating, so it is usually higher than a fasting result.',
    high: 'It can be high with prediabetes or diabetes, or after a recent meal. Illness, stress and some medicines can also raise it. ' + NOT_ALARM,
    low: 'It can be low with diabetes medicines, not eating enough or extra activity.',
    affects: ['How long ago you ate', 'Medicines such as steroids', 'Recent illness or stress', 'Recent exercise'],
    ask: ['Was this taken after eating, and does that matter?', 'Should I have a fasting test or an HbA1c as well?'],
    url: `${ML}blood-glucose-test/`
  },
  {
    code: 'hba1c', loinc: '4548-4', topic: 'diabetes2', name: 'HbA1c', aliases: ['hba1c ngsp', 'glycated hemoglobin', 'glycosylated hemoglobin', 'a1c'], organ: 'Average blood sugar', short: 'Average sugar over about 3 months',
    what: 'HbA1c shows your average blood sugar over about the last 2 to 3 months, as the share of your hemoglobin that is coated with sugar. You do not need to fast for it.',
    high: 'A higher result means your blood sugar has been higher on average. Doctors compare it with set cut-offs and often repeat it to be sure, so ask your doctor what yours means. ' + NOT_ALARM,
    low: 'MedlinePlus does not say what a low value means, so ask your doctor if yours is low.',
    affects: ['Anemia and other blood conditions', 'Kidney or liver disease', 'Some medicines', 'Pregnancy'],
    ask: ['What HbA1c should I aim for?', 'Do my medicines or meals need to change?'],
    url: `${ML}hemoglobin-a1c-hba1c-test/`
  },
  {
    code: 'total_cholesterol', loinc: '2093-3', topic: 'cholesterol', name: 'Total cholesterol', aliases: ['cholesterol', 'totalcholesterol'], organ: 'Blood fat (cholesterol)', short: 'All the cholesterol in your blood',
    what: 'Total cholesterol adds up the different kinds of cholesterol in your blood, including LDL and HDL.',
    high: 'A higher number can raise the long-term chance of heart and blood vessel problems. Food, weight, activity, smoking and family history all play a part. ' + NOT_ALARM,
    low: 'A low total cholesterol is usually not a concern on its own.',
    affects: ['Fasting for 9 to 12 hours, if the lab asked you to', 'Foods high in saturated fat', 'Weight, activity, smoking and alcohol', 'Age and family history'],
    ask: ['What should my cholesterol numbers be for me?', 'When should I have this checked again?'],
    url: `${ML}cholesterol-levels/`
  },
  {
    code: 'ldl', loinc: '13457-7', topic: 'cholesterol', name: 'LDL cholesterol', aliases: ['ldl cholesterol', 'ldl-c', 'ldlcholesterol'], organ: 'Blood fat (cholesterol)', short: 'Cholesterol that can build up in blood vessels',
    what: 'LDL is the cholesterol that can build up in the walls of blood vessels. It is often called the "bad" cholesterol. Some labs calculate it from other results.',
    high: 'A higher LDL can raise the long-term chance of heart attack and stroke. Food, weight, activity, smoking and family history all play a part. ' + NOT_ALARM,
    low: 'A low LDL is usually not a concern.',
    affects: ['Foods high in saturated fat', 'Weight and activity', 'Smoking and alcohol', 'Age, family history, and whether the lab measured it or calculated it'],
    ask: ['Is my LDL where you want it for me?', 'Should I change what I eat, or my medicines, because of this?'],
    url: `${ML}cholesterol-levels/`
  },
  {
    code: 'hdl', loinc: '2085-9', topic: 'cholesterol', name: 'HDL cholesterol', aliases: ['hdl cholesterol', 'hdl-c', 'hdlcholesterol'], organ: 'Blood fat (cholesterol)', short: 'Cholesterol that carries other cholesterol away',
    what: 'HDL is the cholesterol that helps carry other cholesterol away from the blood. It is often called the "good" cholesterol, so for HDL a higher number is better.',
    high: 'A high HDL is usually not a concern.',
    low: 'A low HDL means less cholesterol is being carried away, which can raise the long-term chance of heart problems. ' + NOT_ALARM,
    affects: ['Activity level and weight', 'Smoking', 'Age, sex and family history', 'Fasting, if the lab asked you to'],
    ask: ['Is my HDL a concern for me?', 'Would more walking or activity help?'],
    url: `${ML}cholesterol-levels/`
  },
  {
    code: 'triglycerides', loinc: '2571-8', topic: 'cholesterol', name: 'Triglycerides', aliases: ['trigly', 'tg', 'triglyceride'], organ: 'Blood fat', short: 'A type of fat in the blood',
    what: 'Triglycerides are a type of fat in the blood. They are usually checked with cholesterol as part of a lipid profile.',
    high: 'A high result can go with a diet rich in fat, sugar or refined carbs, too little exercise, being overweight, diabetes or some other conditions. Very high levels can irritate the pancreas. ' + NOT_ALARM,
    low: 'A low result is usually not a concern.',
    affects: ['Eating before the test (fast 9 to 12 hours if asked)', 'Sugary and fatty foods, and alcohol', 'Activity level', 'Some medicines, such as water pills'],
    ask: ['Was this test taken fasting, and does that matter?', 'What could lower my triglycerides?'],
    url: `${ML}triglycerides-test/`
  },
  {
    code: 'hemoglobin', loinc: '718-7', topic: 'anemia', name: 'Hemoglobin', aliases: ['hgb', 'hb', 'haemoglobin'], organ: 'Blood oxygen carrier', short: 'Carries oxygen in red blood cells',
    what: 'Hemoglobin is the iron-rich part of red blood cells that carries oxygen around the body. It is usually part of a complete blood count (CBC) and is often used to look for anemia.',
    high: 'It can be high with dehydration, smoking, living at high altitude, or lung, heart or sleep problems. ' + NOT_ALARM,
    low: 'It can be low with anemia, for example from low iron or vitamin B12, blood loss such as heavy periods, or a long-term illness. A low result can go with feeling tired. ' + NOT_ALARM,
    affects: ['Living at a high altitude', 'Dehydration and smoking', 'Some medicines', 'Diet, especially iron and vitamin B12'],
    ask: ['Could my hemoglobin be why I feel tired?', 'Do I need any other test to find the reason?'],
    url: `${ML}hemoglobin-test/`
  },
  {
    code: 'hematocrit', loinc: '4544-3', topic: 'anemia', name: 'Hematocrit', aliases: ['hct', 'haematocrit', 'pcv'], organ: 'Red cell share of blood', short: 'The share of your blood that is red cells',
    what: 'Hematocrit is the percentage of your blood made up of red blood cells. It is usually part of a complete blood count (CBC).',
    high: 'It is most often high from dehydration. Lung or heart problems and too many red blood cells can also raise it. ' + NOT_ALARM,
    low: 'It can be low with anemia, recent or long-term blood loss, or a bone marrow problem. Pregnancy often lowers it a little. ' + NOT_ALARM,
    affects: ['How much water you have had', 'Living at a high altitude', 'Smoking, age and sex', 'Pregnancy'],
    ask: ['Is my hematocrit a concern for me?', 'Should I drink more water, or repeat this test?'],
    url: `${ML}hematocrit-test/`
  },
  {
    code: 'rbc', loinc: '789-8', topic: 'anemia', name: 'Red blood cells', aliases: ['red blood cells', 'red blood cell count', 'rbc count'], organ: 'Red blood cell count', short: 'How many red blood cells you have',
    what: 'The red blood cell count is the number of red blood cells in a blood sample. They carry oxygen around the body. It is usually part of a complete blood count (CBC).',
    high: 'It can be high with dehydration, smoking, living at high altitude, or lung or heart problems. ' + NOT_ALARM,
    low: 'It can be low with anemia, blood loss, poor nutrition, kidney problems or pregnancy.',
    affects: ['Smoking and living at a high altitude', 'Dehydration', 'Pregnancy', 'Some medicines'],
    ask: ['Is my red blood cell count a concern for me?', 'Do I need other blood tests with it?'],
    url: `${ML}red-blood-cell-rbc-count/`
  },
  {
    code: 'wbc', loinc: '6690-2', name: 'White blood cells', aliases: ['white blood cells', 'white blood cell count', 'wbc count'], organ: 'Infection-fighting cells', short: 'Cells that help fight infection',
    what: 'White blood cells help the body fight infection. The count is the total number in a blood sample. It does not show the different types.',
    high: 'It is often high with an infection or inflammation, and can also rise with stress, smoking, allergies, some medicines or an injury. ' + NOT_ALARM,
    low: 'It can be low after some infections, with some medicines or treatments, or with conditions that affect the bone marrow or immune system. ' + NOT_ALARM,
    affects: ['A recent or current infection', 'Smoking and stress', 'Some medicines', 'Pregnancy'],
    ask: ['Is my white blood cell count a concern for me?', 'Should this be repeated, and when?'],
    url: `${ML}white-blood-count-wbc/`
  },
  {
    code: 'platelets', loinc: '777-3', name: 'Platelets', aliases: ['plt', 'platelet count', 'platelet'], organ: 'Blood clotting cells', short: 'Small cells that help blood clot',
    what: 'Platelets are small blood cells that help the blood to clot. The count is how many are in a blood sample.',
    high: 'A high count can happen after infection, inflammation, blood loss or iron-poor blood, and sometimes with other conditions. ' + NOT_ALARM,
    low: 'A low count can make bruising or bleeding easier. It can go with viral infections, some medicines, liver or bone marrow problems, or low vitamin B12. It is usually checked again. ' + NOT_ALARM,
    affects: ['A recent infection', 'Pregnancy (a mild, usually passing dip)', 'Some medicines', 'Some common pain relievers'],
    ask: ['Is my platelet count a concern for me?', 'Should I avoid any medicines because of it?'],
    url: `${ML}platelet-tests/`
  },
  {
    code: 'tsh', loinc: '3016-3', topic: 'thyroid', name: 'TSH', aliases: ['thyroid stimulating hormone'], organ: 'Thyroid control hormone', short: 'The hormone that tells the thyroid how hard to work',
    what: 'TSH is made by the pituitary gland and tells the thyroid how much hormone to make. It is the usual first test of how the thyroid is doing.',
    high: 'A high TSH can mean the thyroid is underactive, so the body is asking it to work harder. The test does not show the cause, so doctors often add other thyroid tests. ' + NOT_ALARM,
    low: 'A low TSH can mean the thyroid is overactive. Some other illnesses and early pregnancy can also lower it for a while.',
    affects: ['Some medicines, so tell your doctor what you take', 'Illness at the time of the test', 'Pregnancy', 'Age (it tends to be higher in people over 80)'],
    ask: ['Does my TSH need other thyroid tests?', 'Could any of my medicines affect it?'],
    url: `${ML}tsh-thyroid-stimulating-hormone-test/`
  }
]

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const INDEX = new Map<string, LabEntry>()
for (const e of LAB_GLOSSARY) for (const k of [e.code, e.name, ...e.aliases]) INDEX.set(squash(k), e)

/** The glossary entry for a test code, name or alias (case-blind, punctuation ignored). Null when the glossary has none: never a guess. */
export function labEntry(test: string): LabEntry | null {
  return INDEX.get(squash(test)) ?? null
}
