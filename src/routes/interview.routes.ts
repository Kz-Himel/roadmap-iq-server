// routes/interview.routes.ts
import { Router, Request, Response } from "express";
import { ObjectId } from "mongodb";
import { db } from "../config/db.js";
import { verifyToken } from "../middleware/verifyToken.js";
import { groq, AI_MODEL } from "../utils/ai.js";
import {
  INTERVIEW_TYPES,
  INTERVIEW_DIFFICULTIES,
  TOTAL_INTERVIEW_QUESTIONS,
  type MockInterviewDocument,
  type InterviewType,
  type InterviewDifficulty,
  type InterviewQA,
} from "../types/interview.js";

const router = Router();

function buildContext(role: string, difficulty: InterviewDifficulty, type: InterviewType) {
  return `Role: ${role}\nDifficulty: ${difficulty}\nInterview type: ${type}`;
}

// Helper: send one SSE event
function makeSender(res: Response) {
  return (payload: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };
}

// Helper: stream a plain-text completion (question or summary) chunk by chunk
async function streamText(
  res: Response,
  sendEvent: (p: Record<string, unknown>) => void,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number
): Promise<string> {
  const stream = await groq.chat.completions.create({
    model: AI_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: maxTokens,
    stream: true,
  });

  let full = "";
  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content ?? "";
    if (delta) {
      full += delta;
      sendEvent({ type: "chunk", text: delta });
    }
  }
  return full.trim();
}

// Helper: evaluate an answer (non-streaming, JSON)
async function evaluateAnswer(
  context: string,
  question: string,
  answer: string
): Promise<{ score: number; feedback: string }> {
  const fallback = { score: 5, feedback: "Answer recorded. Keep practicing to improve clarity and depth." };

  try {
    const completion = await groq.chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: "system",
          content: `You are an expert interviewer evaluating a candidate's spoken/written answer during a mock interview.
Respond ONLY in valid JSON, no markdown: { "score": number (0-10), "feedback": string (2-4 concise, constructive sentences) }`,
        },
        {
          role: "user",
          content: `${context}\n\nQuestion: ${question}\nCandidate's answer: ${answer}\n\nEvaluate the answer. Return ONLY the JSON object.`,
        },
      ],
      temperature: 0.4,
      max_tokens: 300,
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "";
    const clean = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    if (typeof parsed.score === "number" && typeof parsed.feedback === "string") {
      return { score: Math.min(Math.max(parsed.score, 0), 10), feedback: parsed.feedback };
    }
    return fallback;
  } catch (err) {
    console.error("Evaluate Answer Error:", err);
    return fallback;
  }
}

// POST /start - create session + stream first question
router.post("/start", verifyToken, async (req: Request, res: Response) => {
  const activeUser = req.user;
  const { role, difficulty, type } = req.body as {
    role?: string;
    difficulty?: InterviewDifficulty;
    type?: InterviewType;
  };

  if (!activeUser?.email) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  if (!role || !role.trim()) {
    return res.status(400).json({ success: false, message: "Role is required." });
  }
  if (!difficulty || !INTERVIEW_DIFFICULTIES.includes(difficulty)) {
    return res.status(400).json({
      success: false,
      message: `Difficulty must be one of: ${INTERVIEW_DIFFICULTIES.join(", ")}`,
    });
  }
  if (!type || !INTERVIEW_TYPES.includes(type)) {
    return res.status(400).json({
      success: false,
      message: `Type must be one of: ${INTERVIEW_TYPES.join(", ")}`,
    });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  const sendEvent = makeSender(res);

  try {
    const context = buildContext(role.trim(), difficulty, type);

    const doc: MockInterviewDocument = {
      userEmail: activeUser.email,
      role: role.trim(),
      difficulty,
      type,
      questions: [],
      status: "in-progress",
      createdAt: new Date(),
    };

    const inserted = await db.collection<MockInterviewDocument>("mockInterviews").insertOne(doc);
    sendEvent({ type: "session", sessionId: inserted.insertedId.toString() });

    const questionText = await streamText(
      res,
      sendEvent,
      `You are conducting a live ${type} mock interview for CareerPilot AI. Ask exactly ONE interview question suited to the given role and difficulty. Output ONLY the question text — no numbering, no preamble, no meta commentary.`,
      `${context}\n\nAsk the first interview question.`,
      200
    );

    const qa: InterviewQA = { question: questionText };
    await db
      .collection<MockInterviewDocument>("mockInterviews")
      .updateOne({ _id: inserted.insertedId }, { $push: { questions: qa } });

    sendEvent({ type: "done", question: questionText, questionNumber: 1, totalQuestions: TOTAL_INTERVIEW_QUESTIONS });
    res.end();
  } catch (error) {
    console.error("Interview Start Error:", error);
    try {
      sendEvent({ type: "error", message: "Failed to start interview." });
    } catch {}
    res.end();
  }
});

// POST /:id/answer - submit answer, get evaluation + next question or final summary
router.post("/:id/answer", verifyToken, async (req: Request, res: Response) => {
  const activeUser = req.user;
  const id = req.params.id as string;
  const { answer } = req.body as { answer?: string };

  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: "Invalid session ID." });
  }
  if (!answer || !answer.trim()) {
    return res.status(400).json({ success: false, message: "Answer is required." });
  }

  const session = await db.collection<MockInterviewDocument>("mockInterviews").findOne({ _id: new ObjectId(id) });

  if (!session) {
    return res.status(404).json({ success: false, message: "Interview session not found." });
  }
  if (session.userEmail !== activeUser?.email) {
    return res.status(403).json({ success: false, message: "Not allowed to access this session." });
  }
  if (session.status === "completed") {
    return res.status(400).json({ success: false, message: "This interview is already completed." });
  }

  const currentIndex = session.questions.length - 1;
  const currentQA = session.questions[currentIndex];

  if (!currentQA || currentQA.answer) {
    return res.status(400).json({ success: false, message: "No pending question to answer." });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  const sendEvent = makeSender(res);

  try {
    const context = buildContext(session.role, session.difficulty, session.type);

    // 1. Evaluate the submitted answer
    const { score, feedback } = await evaluateAnswer(context, currentQA.question, answer.trim());

    await db.collection<MockInterviewDocument>("mockInterviews").updateOne(
      { _id: session._id },
      {
        $set: {
          [`questions.${currentIndex}.answer`]: answer.trim(),
          [`questions.${currentIndex}.feedback`]: feedback,
          [`questions.${currentIndex}.score`]: score,
          [`questions.${currentIndex}.answeredAt`]: new Date(),
        },
      }
    );

    sendEvent({ type: "evaluation", score, feedback });

    const answeredCount = currentIndex + 1;
    const isLast = answeredCount >= TOTAL_INTERVIEW_QUESTIONS;

    if (!isLast) {
      // 2a. Stream next question
      const history = session.questions
        .map((q, i) => `Q${i + 1}: ${q.question}${q.answer ? `\nA${i + 1}: ${q.answer}` : ""}`)
        .join("\n");

      const nextQuestion = await streamText(
        res,
        sendEvent,
        `You are conducting a live ${session.type} mock interview for CareerPilot AI. Ask exactly ONE new interview question, different from previous ones, suited to the role/difficulty and building naturally on the conversation. Output ONLY the question text — no numbering, no preamble.`,
        `${context}\n\nInterview so far:\n${history}\n\nAsk question ${answeredCount + 1} of ${TOTAL_INTERVIEW_QUESTIONS}.`,
        200
      );

      const qa: InterviewQA = { question: nextQuestion };
      await db
        .collection<MockInterviewDocument>("mockInterviews")
        .updateOne({ _id: session._id }, { $push: { questions: qa } });

      sendEvent({
        type: "done",
        isComplete: false,
        nextQuestion,
        questionNumber: answeredCount + 1,
        totalQuestions: TOTAL_INTERVIEW_QUESTIONS,
      });
    } else {
      // 2b. Stream overall summary + mark completed
      const updatedSession = await db
        .collection<MockInterviewDocument>("mockInterviews")
        .findOne({ _id: session._id });

      const allQA = updatedSession?.questions ?? [];
      const scores = allQA.map((q) => q.score ?? 0);
      const overallScore = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;

      const transcript = allQA
        .map((q, i) => `Q${i + 1}: ${q.question}\nA${i + 1}: ${q.answer}\nScore: ${q.score}/10`)
        .join("\n\n");

      const overallFeedback = await streamText(
        res,
        sendEvent,
        `You are an expert interview coach. Write a concise overall performance summary (4-6 sentences) covering strengths, weaknesses, and 2-3 concrete improvement tips, based on the full interview transcript. Plain text only, no markdown headers.`,
        `${context}\n\nFull transcript:\n${transcript}\n\nWrite the overall summary.`,
        400
      );

      await db.collection<MockInterviewDocument>("mockInterviews").updateOne(
        { _id: session._id },
        {
          $set: {
            status: "completed",
            overallScore,
            overallFeedback,
            completedAt: new Date(),
          },
        }
      );

      sendEvent({ type: "done", isComplete: true, overallScore, overallFeedback });
    }

    res.end();
  } catch (error) {
    console.error("Interview Answer Error:", error);
    try {
      sendEvent({ type: "error", message: "Failed to process answer." });
    } catch {}
    res.end();
  }
});

// GET / - list current user's past interview sessions
router.get("/", verifyToken, async (req: Request, res: Response) => {
  try {
    const activeUser = req.user;

    const sessions = await db
      .collection<MockInterviewDocument>("mockInterviews")
      .find({ userEmail: activeUser?.email })
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json({ success: true, data: sessions });
  } catch (error) {
    console.error("Fetch Interviews Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch interview history." });
  }
});

// GET /:id - single session detail
router.get("/:id", verifyToken, async (req: Request, res: Response) => {
  try {
    const activeUser = req.user;
    const id = req.params.id as string;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid session ID." });
    }

    const session = await db.collection<MockInterviewDocument>("mockInterviews").findOne({ _id: new ObjectId(id) });

    if (!session) {
      return res.status(404).json({ success: false, message: "Interview session not found." });
    }
    if (session.userEmail !== activeUser?.email) {
      return res.status(403).json({ success: false, message: "Not allowed to access this session." });
    }

    return res.status(200).json({ success: true, data: session });
  } catch (error) {
    console.error("Single Interview Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch interview session." });
  }
});

export default router;