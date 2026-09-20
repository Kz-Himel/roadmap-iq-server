// src/types/interview.ts
import type { ObjectId } from "mongodb";

export type InterviewType = "Technical" | "Behavioral" | "HR";
export type InterviewDifficulty = "Easy" | "Medium" | "Hard";
export type InterviewStatus = "in-progress" | "completed";

export interface InterviewQA {
  question: string;
  answer?: string;
  feedback?: string;
  score?: number; // 0-10
  answeredAt?: Date;
}

export interface MockInterviewDocument {
  _id?: ObjectId;
  userEmail: string;
  role: string;
  difficulty: InterviewDifficulty;
  type: InterviewType;
  questions: InterviewQA[];
  overallScore?: number;
  overallFeedback?: string;
  status: InterviewStatus;
  createdAt: Date;
  completedAt?: Date;
}

export const INTERVIEW_TYPES: InterviewType[] = ["Technical", "Behavioral", "HR"];
export const INTERVIEW_DIFFICULTIES: InterviewDifficulty[] = ["Easy", "Medium", "Hard"];
export const TOTAL_INTERVIEW_QUESTIONS = 5;