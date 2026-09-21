// routes/platform.routes.ts
import { Router, Request, Response } from "express";
import { db } from "../config/db.js";

const router = Router();

// GET /stats - public platform-wide stats for the homepage
router.get("/stats", async (req: Request, res: Response) => {
  try {
    const [totalUsers, totalRoadmaps, totalQuestions, totalInterviews] = await Promise.all([
      db.collection("user").estimatedDocumentCount().catch(() => 0),
      db.collection("roadmaps").countDocuments(),
      db.collection("questionBank").countDocuments(),
      db.collection("mockInterviews").countDocuments({ status: "completed" }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        totalUsers,
        totalRoadmaps,
        totalQuestions,
        totalInterviews,
      },
    });
  } catch (error) {
    console.error("Platform Stats Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch platform stats.",
    });
  }
});

export default router;