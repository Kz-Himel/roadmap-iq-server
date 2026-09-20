// src/types/questionBank.ts
import type { ObjectId } from "mongodb";

export type QuestionCategory =
  | "Frontend"
  | "Backend"
  | "DSA"
  | "System Design"
  | "Behavioral";

export type QuestionDifficulty = "Easy" | "Medium" | "Hard";

export interface QuestionBankDocument {
  _id?: ObjectId;
  category: QuestionCategory;
  difficulty: QuestionDifficulty;
  question: string;
  answer: string;
  tags: string[];
  createdAt: Date;
}

export const QUESTION_CATEGORIES: QuestionCategory[] = [
  "Frontend",
  "Backend",
  "DSA",
  "System Design",
  "Behavioral",
];

export const QUESTION_DIFFICULTIES: QuestionDifficulty[] = [
  "Easy",
  "Medium",
  "Hard",
];