// routes/questionBank.routes.ts
import { Router, Request, Response } from "express";
import { ObjectId } from "mongodb";
import { db } from "../config/db.js";
import { verifyToken } from "../middleware/verifyToken.js";
import { groq, AI_MODEL } from "../utils/ai.js";
import {
  QUESTION_CATEGORIES,
  QUESTION_DIFFICULTIES,
  type QuestionBankDocument,
  type QuestionCategory,
  type QuestionDifficulty,
} from "../types/questionBank.js";

const router = Router();

const QUESTION_GEN_SYSTEM_PROMPT = `You are an expert technical interviewer creating interview question bank entries for CareerPilot AI.
Respond ONLY in valid JSON format, no markdown, no extra text. Follow this exact schema:

{
  "questions": [
    {
      "question": string,
      "answer": string,
      "tags": string[]
    }
  ]
}

Rules:
- "answer" must be a clear, well-structured model answer (3-8 sentences, or bullet-style explanation).
- "tags" should be 2-4 short relevant keywords.
- Do not repeat the same question twice in the array.`;

// POST /generate - AI generates a batch of new questions (Protected)
router.post("/generate", verifyToken, async (req: Request, res: Response) => {
  try {
    const { category, difficulty, count = 5 } = req.body as {
      category?: QuestionCategory;
      difficulty?: QuestionDifficulty;
      count?: number;
    };

    if (!category || !QUESTION_CATEGORIES.includes(category)) {
      return res.status(400).json({
        success: false,
        message: `Category is required and must be one of: ${QUESTION_CATEGORIES.join(", ")}`,
      });
    }

    if (!difficulty || !QUESTION_DIFFICULTIES.includes(difficulty)) {
      return res.status(400).json({
        success: false,
        message: `Difficulty is required and must be one of: ${QUESTION_DIFFICULTIES.join(", ")}`,
      });
    }

    const safeCount = Math.min(Math.max(Number(count) || 5, 1), 10);

    // Fetch existing questions in this category+difficulty so AI avoids repeats
    const existing = await db
      .collection<QuestionBankDocument>("questionBank")
      .find({ category, difficulty })
      .project({ question: 1 })
      .limit(50)
      .toArray();

    const existingList = existing.map((q) => q.question).join("\n- ");

    const userPrompt = `Generate ${safeCount} NEW interview questions for:
- Category: ${category}
- Difficulty: ${difficulty}

${existingList ? `Avoid duplicating or closely rephrasing these existing questions:\n- ${existingList}` : ""}

Return ONLY the JSON object, nothing else.`;

    const completion = await groq.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: "system", content: QUESTION_GEN_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.8,
      max_tokens: 2000,
    });

    const rawText = completion.choices[0]?.message?.content?.trim() ?? "";
    const cleanText = rawText.replace(/```json|```/g, "").trim();

    let parsed: { questions?: { question: string; answer: string; tags: string[] }[] };
    try {
      parsed = JSON.parse(cleanText);
    } catch (parseErr) {
      console.error("Question Generate JSON parse failed:", cleanText);
      return res.status(500).json({
        success: false,
        message: "AI returned invalid format. Please try again.",
      });
    }

    const generated = Array.isArray(parsed.questions) ? parsed.questions : [];

    if (generated.length === 0) {
      return res.status(500).json({
        success: false,
        message: "AI did not return any questions. Please try again.",
      });
    }

    // Dedup against existing questions (case-insensitive exact match)
    const existingSet = new Set(existing.map((q) => q.question.trim().toLowerCase()));

    const docs: QuestionBankDocument[] = generated
      .filter((q) => q?.question && q?.answer && !existingSet.has(q.question.trim().toLowerCase()))
      .map((q) => ({
        category,
        difficulty,
        question: q.question.trim(),
        answer: q.answer.trim(),
        tags: Array.isArray(q.tags) ? q.tags.slice(0, 4) : [],
        createdAt: new Date(),
      }));

    if (docs.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No new unique questions were generated. Try again for more variety.",
        data: [],
      });
    }

    const result = await db.collection<QuestionBankDocument>("questionBank").insertMany(docs);

    return res.status(201).json({
      success: true,
      message: `${docs.length} new question(s) generated.`,
      insertedCount: result.insertedCount,
      data: docs,
    });
  } catch (error) {
    console.error("Question Generate Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate questions.",
    });
  }
});

// GET / - list questions (Public, with filter + search + pagination)
router.get("/", async (req: Request, res: Response) => {
  try {
    const {
      category = "",
      difficulty = "",
      search = "",
      page = "1",
      limit = "9",
    } = req.query as Record<string, string>;

    const query: any = {};

    if (category) query.category = category;
    if (difficulty) query.difficulty = difficulty;

    if (search) {
      query.$or = [
        { question: { $regex: search, $options: "i" } },
        { tags: { $regex: search, $options: "i" } },
      ];
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 9;
    const skip = (pageNum - 1) * limitNum;

    const total = await db.collection("questionBank").countDocuments(query);

    const questions = await db
      .collection("questionBank")
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .toArray();

    return res.status(200).json({
      success: true,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
      data: questions,
    });
  } catch (error) {
    console.error("Get Questions Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch questions.",
    });
  }
});

// GET /:id - single question (Public)
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Question ID",
      });
    }

    const question = await db.collection("questionBank").findOne({ _id: new ObjectId(id) });

    if (!question) {
      return res.status(404).json({
        success: false,
        message: "Question not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: question,
    });
  } catch (error) {
    console.error("Single Question Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch question.",
    });
  }
});

export default router;