/**
 * The NICOM reviewer evaluation matrix, worded exactly as the committee's form.
 * Every page, the Sheet columns, the CSV export and the decision emails read from here.
 */

/** Rated 1 (Strongly Disagree) to 5 (Strongly Agree). All are required. */
export const CRITERIA = [
  { key: "novelty", header: "Novelty", statement: "The research indicates the novelty of the study in present time" },
  { key: "literature", header: "Literature Review", statement: "The paper indicates a thorough understanding of current research on the topic in view of adequate review of literature." },
  { key: "methodology", header: "Methodology", statement: "The research methodology is relevant and properly administered. (For empirically oriented articles only)." },
  { key: "analysis", header: "Data Analysis", statement: "The methods of data analysis are adequate. (For empirically oriented articles only)." },
  { key: "organisation", header: "Organisation", statement: "The manuscript is well organised." },
  { key: "contribution", header: "Contribution to Management", statement: "The paper contributes to the knowledge of Management Discipline." },
  { key: "relevance", header: "Relevance", statement: "The subject of the research is relevant, timely and important." },
  { key: "implications", header: "Findings & Implications", statement: "The findings, conclusions and managerial implications are appropriate, useful, and clearly presented." },
  { key: "usefulness", header: "Usefulness to Academia & Industry", statement: "The findings and methodology in this paper have a good implication to the users in the concerned field of academics and industry" },
] as const;
export type CriterionKey = (typeof CRITERIA)[number]["key"];

/** Yes/No nominations. Internal: shown to the committee only, never in emails to authors. */
export const NOMINATIONS = [
  { key: "journal", header: "Journal of NIRMA", question: "Can this paper be considered for publication in Journal of NIRMA?" },
  { key: "scopus", header: "SCOPUS Journal", question: "Can this paper be considered for the SCOPUS Indexed Journal?" },
  { key: "bestPaper", header: "Best Paper", question: "Do you consider it for Best Paper?" },
] as const;
export type NominationKey = (typeof NOMINATIONS)[number]["key"];
export type YesNo = "Yes" | "No";

export const OVERALL_QUESTION = "What is your overall evaluation of the paper for publication in the book?";

/** A reviewer's average over the nine statements, or null if any is missing. */
export function averageScore(r: Partial<Record<CriterionKey, number>>): number | null {
  const v = CRITERIA.map((c) => Number(r[c.key]));
  return v.every((n) => n >= 1 && n <= 5) ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/** How many of a paper's reviewers answered Yes to each nomination question. */
export function nominationTally(reviews: Partial<Record<NominationKey, string>>[]) {
  return NOMINATIONS.map((q) => ({ ...q, yes: reviews.filter((r) => r[q.key] === "Yes").length, total: reviews.length }));
}
