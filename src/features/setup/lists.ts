/** Suggestion lists for the setup questions (Philippines). People can always add their own. */
export const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
export const ALLERGIES = ['None', 'Penicillin', 'Sulfa drugs', 'Aspirin/NSAIDs', 'Seafood/shellfish', 'Peanuts', 'Eggs', 'Milk', 'Latex', 'Dust/pollen']
export const CONDITIONS = ['None', 'High blood pressure', 'Diabetes', 'Asthma', 'Heart disease', 'High cholesterol', 'Arthritis', 'Kidney disease', 'Thyroid problem', 'Stroke history']
export const MEDICINES = ['Losartan', 'Amlodipine', 'Metformin', 'Atorvastatin', 'Simvastatin', 'Aspirin 80mg', 'Metoprolol', 'Gliclazide', 'Insulin', 'Salbutamol inhaler']
export const RELATIONSHIPS = ['Spouse', 'Son', 'Daughter', 'Mother', 'Father', 'Brother', 'Sister', 'Grandchild', 'Neighbor', 'Doctor']

/** Stored answers are one string, items joined by this. Typed items never contain a comma. */
export const JOIN = ', '
export const splitItems = (s: string | undefined): string[] => (s ? s.split(JOIN).map((x) => x.trim()).filter(Boolean) : [])
export const cleanItem = (s: string): string => s.replace(/,/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40)

/** "Not sure" is stored as this, never as an empty value or 0 (B-5). Also the server value for an unknown blood type / allergy / condition. */
export const UNKNOWN = 'UNKNOWN'
