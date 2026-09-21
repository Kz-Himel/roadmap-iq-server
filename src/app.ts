import express from "express";
import cors from "cors";

import goalRoutes from "./routes/goal.routes.js";
import myGoalsRoutes from "./routes/my-goals.routes.js";
import chatRoutes from "./routes/chat.routes.js";
import roadmapRoutes from "./routes/roadmap.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import savedGoalsRoutes from "./routes/savedGoals.routes.js";
import questionBankRoutes from "./routes/questionBank.routes.js";
import interviewRoutes from "./routes/interview.routes.js";
import platformRoutes from "./routes/platform.routes.js";


const app = express();


const allowedOrigins = [
    process.env.CLIENT_URL,
    "http://localhost:3000"
].filter((origin): origin is string => Boolean(origin));


app.use(cors({
    origin: allowedOrigins,
    credentials: true
}));


app.use(express.json());


app.get("/", (_req, res) => {
    res.send("CareerPilot AI API Running 🚀");
});


// Production API Routes
app.use("/goals", myGoalsRoutes);
app.use("/goals", goalRoutes);
app.use("/chat", chatRoutes);
app.use("/roadmaps", roadmapRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/saved-goals", savedGoalsRoutes);
app.use("/questions", questionBankRoutes);
app.use("/interview", interviewRoutes);
app.use("/platform", platformRoutes);


export default app;