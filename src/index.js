import express from "express";
import { createClient } from "../util/subabase.js";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";
// import scheduler from '../routes/schedule.js'
// import progressRouter from '../routes/progress.js'

const app = express();

import cors from "cors";

// top of src/index.js
const allowlist = ["http://localhost:3000", "http://localhost:3001"];
const vercelRegex = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i;

console.log("[INDEX] Starting to load index.js");
console.log("[INDEX] Env check:", {
  hasSupabaseUrl: !!process.env.SUPABASE_URL,
  hasGoogleKey: !!process.env.GOOGLE_API_KEY,
});

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowlist.includes(origin) || vercelRegex.test(origin))
        return cb(null, true);
      return cb(new Error("CORS blocked"), false);
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
  }),
);
app.options("*", cors());

// Robustly extract a JSON block from an LLM response
function extractJsonBlock(s) {
  if (typeof s !== "string") return "";
  // 1) fenced ```json ... ```
  const fenceJson = s.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fenceJson && fenceJson[1]) return fenceJson[1];
  // 2) any fenced ``` ... ```
  const fenceAny = s.match(/```\s*([\s\S]*?)\s*```/);
  if (fenceAny && fenceAny[1]) return fenceAny[1];
  // 3) first balanced { ... }
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start !== -1 && end > start) return s.slice(start, end + 1);
  return s.trim();
}

// Admin Supabase client for trusted reads in public schema
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server env
const admin = createSupabaseAdminClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

/**
 * Middleware functions
 */

// Middleware to parse JSON request body
app.use(express.json());

const verifyUser = async (req, res, next) => {
  const supabase = createClient({ req, res });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return res.status(401).json({ error: "Not logged in." });
  }

  // user is logged in
  next();
};
//collect examples
function collectExampleTopics(examples) {
  const set = new Set();
  if (Array.isArray(examples)) {
    for (const ex of examples) {
      const tlist = Array.isArray(ex?.topics) ? ex.topics : [];
      for (const t of tlist) {
        const s = String(t ?? "").trim();
        if (s) set.add(s);
      }
    }
  }
  return Array.from(set).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
}

// Public graph route (no auth cookie required) **NEW**
app.get("/public/class/:id/knowledge-graph", async (req, res) => {
  try {
    const { id } = req.params;

    // Accept either numeric class_id or a slug/name (e.g. "demo-class")
    let classIdNum = Number(id);
    if (!Number.isFinite(classIdNum)) {
      const cleaned = decodeURIComponent(String(id)).replace(/-/g, " ").trim();
      const { data: cls, error: clsErr } = await admin
        .schema("public")
        .from("classes")
        .select("class_id")
        .ilike("name", cleaned)
        .maybeSingle();

      if (clsErr) {
        console.error("Classes lookup error:", clsErr.message);
        return res.status(500).json({ error: clsErr.message });
      }
      if (!cls) {
        // No such class — return empty graph so clients can render gracefully
        return res
          .status(200)
          .json({ nodes: [], edges: [], trackingThreshold: 10 });
      }
      classIdNum = Number(cls.class_id);
    }

    const { data: classGraph, error: classGraphErr } = await admin
      .schema("public")
      .from("class_knowledge_graph")
      .select("react_flow_data")
      .eq("class_id", classIdNum)
      .maybeSingle();

    // If row not found, return 200 with empty graph
    if (classGraphErr) {
      console.warn("Class graph lookup warning:", classGraphErr);
      return res
        .status(200)
        .json({ nodes: [], edges: [], trackingThreshold: 10 });
    }
    if (!classGraph) {
      return res
        .status(200)
        .json({ nodes: [], edges: [], trackingThreshold: 10 });
    }

    const rf = Array.isArray(classGraph?.react_flow_data)
      ? classGraph.react_flow_data[0]
      : null;
    if (!rf || !rf.reactFlowNodes || !rf.reactFlowEdges) {
      return res
        .status(200)
        .json({ nodes: [], edges: [], trackingThreshold: 10 });
    }

    const reactFlowNodes = rf.reactFlowNodes || [];
    const reactFlowEdges = rf.reactFlowEdges || [];

    const nodes = reactFlowNodes
      .map((n) => {
        const idNum = Number(n.id);
        const label = n?.data?.label ?? String(n.id);
        const position = n?.position || { x: 0, y: 0 };
        const correctResponses = Number(n?.data?.correctResponses) || 0;
        const occurrences = Number(n?.data?.occurrences) || 0;
        return {
          id: idNum,
          label,
          position,
          correctResponses,
          occurrences,
          isActive: true,
        };
      })
      .sort((a, b) => a.id - b.id);

    const edges = reactFlowEdges.map((e) => ({
      source: Number(e.source),
      target: Number(e.target),
    }));

    return res.status(200).json({ nodes, edges, trackingThreshold: 10 });
  } catch (e) {
    console.error("public knowledge-graph endpoint error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

app.use("/user", verifyUser);

/**
 * Test route to check if the server is running
 */
app.get("/", async (req, res) => {
  res.status(200).send("IT WORKS 😊");
});

/**
 * Logs the user in given the email and password
 * and returns a 200 status code if successful
 */
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (typeof email !== "string" || typeof password !== "string") {
    return res
      .status(400)
      .json({ error: "Please provide valid email or password" });
  }

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const supabase = createClient({ req, res });
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error) {
    return res.status(401).json({ error: error.message });
  }

  // Return the session so mobile can use it
  return res.status(200).json({
    message: "Logged in!",
    session: data.session,
    user: data.user,
  });
});

/**
 * Registers a new user given email and password
 * and returns a 201 status code if successful
 */
app.post("/register", async (req, res) => {
  const { email, password, displayName } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const supabase = createClient({ req, res });
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      data: {
        displayName: typeof displayName === "string" ? displayName : null,
      },
    },
  });

  if (error) {
    return res.status(400).json({ error: error.message });
  }
  // Create or update the student's profile row immediately after signup
  // Use the admin client so this works even if email confirmation prevents a session
  try {
    const newUser = data?.user;
    if (newUser && newUser.id) {
      const displayNameSafe =
        typeof displayName === "string" ? displayName : null;
      const { error: upsertErr } = await admin
        .schema("public")
        .from("students")
        .upsert(
          {
            student_id: newUser.id,
            email: newUser.email ?? null,
            display_name: displayNameSafe,
            consent: Boolean(req.body?.consent),
            over_18: Boolean(req.body?.isOver18),
          },
          { onConflict: "student_id" },
        );

      if (upsertErr) {
        console.error(
          "students upsert after signup failed:",
          upsertErr.message,
        );
        // Do not fail registration; surface a soft warning for observability
      }
    }
  } catch (e) {
    console.error("students upsert exception:", e);
  }

  return res.status(201).json({ message: "User registered!", user: data.user });
});

app.post("/logout", async (req, res) => {
  const supabase = createClient({ req, res });
  const { error } = await supabase.auth.signOut();

  return error
    ? res.status(500).json({ error: error.message })
    : res.status(204).send();
});

/**
 * Gets the account information of the student
 * given the user is logged in
 */
app.get("/user/account-info", async (req, res) => {
  const supabase = createClient({ req, res });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return !user
    ? res.status(401).json({ error: "Not logged in." })
    : res.status(200).json({
        userID: user.id,
        email: user.email,
        displayName: user.user_metadata?.displayName || null,
      });
});

/**
 * Gets all classes that a student is enrolled in
 * given the student is logged in
 */
// app.get('/user/enrolled-classes', async (req, res) => {
//   const supabase = createClient({ req, res })

//   const { data: { user }, error: userError } = await supabase.auth.getUser()
//   if (userError || !user) {
//     return res.status(401).json({ error: 'Not logged in.' })
//   }

//   const { data: enrolledClasses, error } = await supabase
//     .schema('test_database')
//     .from('enrollments')
//     .select('class_id')
//     .eq('user_id', user.id)

//   if (error) {
//     return res.status(500).json({ error: error.message })
//   }

//   const classIDs = (enrolledClasses || []).map(enrollment => enrollment.class_id)
//   if (classIDs.length === 0) return res.status(200).json([])

//   const { data: classes, error: classesError } = await supabase
//     .schema('test_database')
//     .from('classes')
//     .select('*')
//     .in('class_id', classIDs)

//   if (classesError) {
//     return res.status(500).json({ error: classesError.message })
//   }

//   return res.status(200).json(classes)
// })
app.get("/user/enrolled-classes", async (req, res) => {
  const supabase = createClient({ req, res });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return res.status(401).json({ error: "Not logged in." });
  }

  const { data: enrolledClasses, error } = await supabase
    .schema("public")
    .from("enrollments")
    .select("class_id")
    .eq("student_id", user.id);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const classIDs = (enrolledClasses || []).map(
    (enrollment) => enrollment.class_id,
  );
  if (classIDs.length === 0) return res.status(200).json([]);

  const { data: classes, error: classesError } = await supabase
    .schema("public")
    .from("classes")
    .select("*")
    .in("class_id", classIDs);

  if (classesError) {
    return res.status(500).json({ error: classesError.message });
  }

  return res.status(200).json(classes);
});

/**
 * Gets a specific class that a student is enrolled in
 * given the class ID and if the student is logged in
 */
app.get("/user/enrolled-class/:id", async (req, res) => {
  const supabase = createClient({ req, res });

  const { id } = req.params;
  const { data: enrolledClass, error } = await supabase
    .schema("public")
    .from("classes")
    .select("*")
    .eq("class_id", id);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json(enrolledClass);
});

/**
 * Gets all lessons for a specific class that a student is enrolled in
 * given the class ID and if the student is logged in
 */
app.get("/user/enrolled-class/:id/lessons", async (req, res) => {
  const supabase = createClient({ req, res });

  // validate class ID input
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: "Class ID is required" });
  }

  const idAsNum = parseInt(id);
  if (!Number.isFinite(idAsNum)) {
    return res.status(400).json({ error: "Class ID must be a number" });
  }

  const { data: enrollment, error: enrollmentError } = await supabase
    .schema("public")
    .from("enrollments")
    .select("class_id")
    .eq("class_id", idAsNum)
    .limit(1);

  if (enrollmentError) {
    return res.status(500).json({ error: enrollmentError.message });
  } else if (!enrollment || enrollment.length === 0) {
    return res.status(404).json({ error: "Not enrolled in this class" });
  }

  const { data: lessons, error: lessonsError } = await supabase
    .schema("public")
    .from("class_lesson_bank")
    .select(
      `
    lesson_id,
    lessonDetails:lessons!inner(name, topics)
  `,
    )
    .eq("class_id", idAsNum)
    .eq("lessons.is_published", true);

  if (lessonsError) {
    return res.status(500).json({ error: lessonsError.message });
  }

  const formattedLessons = (lessons || [])
    .filter((lesson) => lesson && lesson.lessonDetails)
    .map((lesson) => {
      return {
        lesson_id: lesson.lesson_id,
        name: lesson.lessonDetails.name,
        topics: lesson.lessonDetails.topics,
      };
    });

  return res.status(200).json(formattedLessons);
});

/**
 * Gets a specific lesson for a class that a student is enrolled in
 * given the class ID and lesson ID and if the student is logged in
 */
app.get("/user/enrolled-class/:id/lesson/:lessonID", async (req, res) => {
  const supabase = createClient({ req, res });

  const { id, lessonID } = req.params;
  if (!id || !lessonID) {
    return res
      .status(400)
      .json({ error: "Class ID and Lesson ID are required" });
  }

  const { data, error } = await supabase
    .schema("public")
    .from("classes")
    .select("*")
    .eq("class_id", id);

  if (error) {
    return res.status(500).json({ error: error.message });
  } else if (data.length === 0) {
    return res.status(404).json({ error: "Class not found" });
  }

  const { data: lesson, error: lessonError } = await supabase
    .schema("public")
    .from("lessons")
    .select("*")
    .eq("lesson_id", lessonID)
    .eq("lessons.is_published", true);

  if (lessonError) {
    return res.status(500).json({ error: lessonError.message });
  }

  return res.status(200).json(lesson);
});

/**
 * Gets questions for a specific lesson for a class that a student is enrolled in
 * given the class ID and lesson ID and if the student is logged in
 */
app.get(
  "/user/enrolled-class/:id/lesson/:lessonID/questions",
  async (req, res) => {
    const supabase = createClient({ req, res });

    const { id, lessonID } = req.params;
    const classIdNum = Number(id);
    const lessonIdNum = Number(lessonID);
    if (!Number.isFinite(classIdNum) || !Number.isFinite(lessonIdNum)) {
      return res
        .status(400)
        .json({ error: "Class ID and Lesson ID must be numbers" });
    }

    // checking to make sure the class and lesson exist AND
    // that the lesson is part of the class
    const { data, error } = await supabase
      .schema("public")
      .from("class_lesson_bank")
      .select("class_id, lesson_id")
      .eq("class_id", classIdNum)
      .eq("lesson_id", lessonIdNum)
      .eq("lessons.is_published", true);

    if (error) {
      return res.status(500).json({ error: error.message });
    } else if (data.length === 0) {
      return res.status(404).json({ error: "Class or Lesson not found" });
    }

    // fetching question IDs for the lesson
    const { data: questionIDs, error: questionIDsError } = await supabase
      .schema("public")
      .from("lesson_question_bank")
      .select("*")
      .eq("lesson_id", lessonID);

    if (questionIDsError) {
      return res.status(500).json({ error: questionIDsError.message });
    }

    // fetching questions based on the question IDs
    const ids = questionIDs.map((question) => question.question_id);
    const { data: questions, error: questionsError } = await supabase
      .schema("public")
      .from("questions")
      .select("*")
      .in("question_id", ids);

    if (questionsError) {
      return res.status(500).json({ error: questionsError.message });
    }

    return res.status(200).json({
      questions: (questions || []).map((q) => ({
        ...q,
        lesson_id: lessonIdNum,
      })),
    });
  },
);

app.get("/user/enrolled-class/:id/knowledge-graph", async (req, res) => {
  try {
    const { id } = req.params;
    const DEFAULT_HALF_LIFE_DAYS = 5;

    // Accept numeric id or slug/name
    let classIdNum = Number(id);
    // get current user id from the request bound supabase client
    const supabaseReq = createClient({ req, res });
    const { data: me } = await supabaseReq.auth.getUser();
    const uid = me?.user?.id || null;

    if (!Number.isFinite(classIdNum)) {
      const cleaned = decodeURIComponent(String(id)).replace(/-/g, " ").trim();
      const { data: cls, error: clsErr } = await admin
        .schema("public")
        .from("classes")
        .select("class_id")
        .ilike("name", cleaned)
        .maybeSingle();

      if (clsErr) {
        console.error("Classes lookup error:", clsErr.message);
        return res.status(500).json({ error: clsErr.message });
      }
      if (!cls) {
        return res
          .status(200)
          .json({ nodes: [], edges: [], trackingThreshold: 10 });
      }
      classIdNum = Number(cls.class_id);
    }

    // 1) Read the class-level graph (admin client to avoid RLS surprises)
    const { data: classGraph, error: classGraphErr } = await admin
      .schema("public")
      .from("class_knowledge_graph")
      .select("react_flow_data")
      .eq("class_id", classIdNum)
      .maybeSingle();

    if (classGraphErr) {
      console.warn("Class graph lookup warning:", classGraphErr);
      return res
        .status(200)
        .json({ nodes: [], edges: [], trackingThreshold: 10 });
    }
    if (!classGraph) {
      return res
        .status(200)
        .json({ nodes: [], edges: [], trackingThreshold: 10 });
    }

    const rf = Array.isArray(classGraph?.react_flow_data)
      ? classGraph.react_flow_data[0]
      : null;
    if (!rf || !rf.reactFlowNodes || !rf.reactFlowEdges) {
      return res
        .status(200)
        .json({ nodes: [], edges: [], trackingThreshold: 10 });
    }

    // 2) Find active topics from active lessons for this class
    const { data: clb, error: clbError } = await admin
      .schema("public")
      .from("class_lesson_bank")
      .select("lesson_id")
      .eq("class_id", classIdNum);

    if (clbError) {
      console.error("Class lesson bank error:", clbError.message);
      return res.status(500).json({ error: clbError.message });
    }

    const lessonIds = (clb || []).map((l) => l.lesson_id);

    let uniqueActiveTopics = new Set();
    if (lessonIds.length > 0) {
      const { data: activeTopics, error: activeTopicsError } = await admin
        .schema("public")
        .from("lessons")
        .select("topics")
        .in("lesson_id", lessonIds);

      if (activeTopicsError) {
        console.error("Lessons error:", activeTopicsError.message);
        return res.status(500).json({ error: activeTopicsError.message });
      }

      uniqueActiveTopics = new Set(
        (activeTopics || []).flatMap((t) => t.topics),
      );
    }

    // pull per student totals from node_schedule for this class
    let totalsByLabel = new Map();
    if (uid) {
      const { data: schedRows, error: schedErr } = await admin
        .schema("public")
        .from("leitner_schedule")
        .select(
          "node_label, total_attempts, total_correct, last_reviewed, last_quiz_attempts, last_quiz_correct, next_review",
        )
        .eq("class_id", classIdNum)
        .eq("student_id", uid);

      if (!schedErr && Array.isArray(schedRows)) {
        for (const r of schedRows) {
          const key = String(r.node_label || "")
            .trim()
            .toLowerCase();
          if (!key) continue;
          totalsByLabel.set(key, {
            attempts: Number(r.total_attempts) || 0,
            correct: Number(r.total_correct) || 0,
            lastReviewed: r.last_reviewed ? String(r.last_reviewed) : null,
            lastQuizAttempts: Number(r.last_quiz_attempts) || 0,
            lastQuizCorrect: Number(r.last_quiz_correct) || 0,
            nextReview: r.next_review ? String(r.next_review) : null,
          });
        }
      }
    }

    // 3) Optional per-student overrides like tracking threshold
    //    Try student_knowledge_graph, but fall back to 10 if not present.
    let trackingThreshold = 10;
    try {
      const { data: skg } = await admin
        .schema("public")
        .from("student_knowledge_graph")
        .select("tracking_threshold")
        .eq("class_id", classIdNum)
        .limit(1)
        .maybeSingle();
      if (skg && typeof skg.tracking_threshold === "number") {
        trackingThreshold = skg.tracking_threshold;
      }
    } catch {}

    // 4) Map React Flow structures to the mobile shape
    const reactFlowNodes = rf.reactFlowNodes || [];
    const reactFlowEdges = rf.reactFlowEdges || [];

    const nodes = reactFlowNodes
      .map((n) => {
        const idNum = Number(n.id);
        const label = n?.data?.label ?? String(n.id);
        const position = n?.position || { x: 0, y: 0 };
        const isActive = uniqueActiveTopics.has(label);

        // defaults from class graph
        const cgCorrect = 0;
        const cgOcc = 0;

        // override with per-student totals if present
        const t = totalsByLabel.get(String(label).trim().toLowerCase());
        const occurrences = t ? Math.max(0, t.attempts) : 0;
        const correctResponses = t ? Math.max(0, t.correct) : 0;

        return {
          id: idNum,
          label,
          position,
          correctResponses,
          occurrences,
          isActive,
          lastReviewed: t ? t.lastReviewed : null,
          lastQuizAttempts: t ? t.lastQuizAttempts : 0,
          lastQuizCorrect: t ? t.lastQuizCorrect : 0,
          nextReview: t ? t.nextReview : null,
        };
      })
      .sort((a, b) => a.id - b.id);

    const edges = reactFlowEdges.map((e) => ({
      source: Number(e.source),
      target: Number(e.target),
    }));

    return res.status(200).json({
      nodes,
      edges,
      trackingThreshold,
      halfLifeDays: DEFAULT_HALF_LIFE_DAYS,
    });
  } catch (e) {
    console.error("knowledge-graph endpoint error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

/**
 * Enroll the current user into a class using a 6-digit invite code
 */

// ...

app.post("/user/join-class", async (req, res) => {
  try {
    // cookie-bound user for auth
    const supabase = createClient({ req, res });
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return res.status(401).json({ success: false, error: "Not logged in." });
    }

    // normalize 6-char alphanumeric code
    const raw = String(req.body?.code || "");
    const code = raw.replace(/[^a-z0-9]/gi, "").toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      return res.status(400).json({
        success: false,
        error: "Code must be 6 alphanumeric characters",
      });
    }

    // trusted reads with service role

    // 1) class_codes lookup in public
    const { data: codeRows, error: codeErr } = await admin
      .schema("public")
      .from("class_codes")
      .select("class_code_id, class_code, expires_at, class_id")
      .eq("class_code", code)
      .order("expires_at", { ascending: false })
      .limit(1);

    if (codeErr) {
      return res.status(500).json({ success: false, error: codeErr.message });
    }
    const codeRow = Array.isArray(codeRows) ? codeRows[0] : null;
    if (!codeRow) {
      return res.status(404).json({ success: false, error: "Invalid code" });
    }
    if (codeRow.expires_at && new Date(codeRow.expires_at) <= new Date()) {
      return res.status(410).json({ success: false, error: "Code expired" });
    }

    // 2) class lookup in public
    const classIdNum = Number(codeRow.class_id);
    const { data: classRows, error: classErr } = await admin
      .schema("public")
      .from("classes")
      .select("class_id, name")
      .eq("class_id", classIdNum)
      .limit(1);

    if (classErr) {
      return res.status(500).json({ success: false, error: classErr.message });
    }
    const cls = Array.isArray(classRows) ? classRows[0] : null;
    if (!cls) {
      return res.status(404).json({ success: false, error: "Class not found" });
    }

    // 3) check existing enrollment and insert with request client
    const { data: existing, error: existErr } = await supabase
      .schema("public")
      .from("enrollments")
      .select("class_id")
      .eq("class_id", cls.class_id)
      .eq("student_id", user.id) // use student_id and the current user's UID
      .maybeSingle();

    if (existErr) {
      return res.status(500).json({ success: false, error: existErr.message });
    }
    if (existing) {
      return res.status(200).json({
        success: true,
        message: "Already enrolled",
        class: { id: cls.class_id, name: cls.name },
      });
    }

    const { error: enrollErr } = await supabase
      .schema("public")
      .from("enrollments")
      .insert([{ class_id: cls.class_id, student_id: user.id }]); // write to student_id

    if (enrollErr) {
      return res.status(500).json({ success: false, error: enrollErr.message });
    }

    return res.status(200).json({
      success: true,
      message: "Enrolled successfully",
      class: { id: cls.class_id, name: cls.name },
    });
  } catch (e) {
    console.error("join-class error:", e);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

/**
 * Mobile-friendly questions endpoints
 * Accept lesson by id or slug. Require auth and validate enrollment.
 */

// GET /mobile/classes/:classId/lessons/:lessonKey/questions
app.get(
  "/mobile/classes/:classId/lessons/:lessonKey/questions",
  verifyUser,
  async (req, res) => {
    try {
      const supabase = createClient({ req, res });
      const { classId, lessonKey } = req.params;
      const { data: me } = await supabase.auth.getUser();
      const uid = me?.user?.id;

      // 1) Validate enrollment for this class
      const { data: enrollment, error: enrollmentErr } = await supabase
        .schema("public")
        .from("enrollments")
        .select("class_id")
        .eq("class_id", Number(classId))
        .eq("student_id", uid)
        .limit(1);

      if (enrollmentErr)
        return res.status(500).json({ error: enrollmentErr.message });
      if (!enrollment || enrollment.length === 0)
        return res.status(404).json({ error: "Not enrolled in this class" });

      // 2) Resolve lesson_id for this class using id or slug/name
      let lessonId = null;
      if (/^\d+$/.test(String(lessonKey))) {
        lessonId = Number(lessonKey);
        // Ensure the lesson belongs to the class
        const { data: linkRows, error: linkErr } = await supabase
          .schema("public")
          .from("class_lesson_bank")
          .select("lesson_id")
          .eq("class_id", Number(classId))
          .eq("lesson_id", lessonId)
          .limit(1);
        if (linkErr) return res.status(500).json({ error: linkErr.message });
        if (!linkRows || linkRows.length === 0)
          return res.status(404).json({ error: "Lesson not found for class" });
      } else {
        const cleanedName = decodeURIComponent(String(lessonKey))
          .replace(/-/g, " ")
          .trim();
        const { data: link, error: linkErr } = await supabase
          .schema("public")
          .from("class_lesson_bank")
          .select("lesson_id, lessonDetails:lessons(name)")
          .eq("class_id", Number(classId))
          .ilike("lessonDetails.name", cleanedName)
          .maybeSingle();
        if (linkErr) return res.status(500).json({ error: linkErr.message });
        if (!link)
          return res.status(404).json({ error: "Lesson not found for class" });
        lessonId = link.lesson_id;
      }

      // 3) Fetch question ids for that lesson
      const { data: qids, error: qidErr } = await supabase
        .schema("public")
        .from("lesson_question_bank")
        .select("question_id")
        .eq("lesson_id", lessonId);

      if (qidErr) return res.status(500).json({ error: qidErr.message });
      if (!qids || qids.length === 0) return res.json({ questions: [] });

      // 4) Fetch questions
      const { data: questions, error: qErr } = await supabase
        .schema("public")
        .from("questions")
        .select("*")
        .in(
          "question_id",
          qids.map((q) => q.question_id),
        );

      if (qErr) return res.status(500).json({ error: qErr.message });

      return res.json({
        questions: (questions || []).map((q) => ({
          ...q,
          lesson_id: lessonId,
        })),
      });
    } catch (e) {
      console.error("mobile questions route error:", e);
      return res.status(500).json({ error: "Server error" });
    }
  },
);

// Optional query variant: /mobile/questions?class_id=..&lesson_id=..
app.get("/mobile/questions", verifyUser, async (req, res) => {
  try {
    const supabase = createClient({ req, res });
    const classId = Number(req.query.class_id);
    const lessonId = Number(req.query.lesson_id);
    if (!Number.isFinite(lessonId))
      return res.status(400).json({ error: "lesson_id required" });

    // enrollment check if class_id present
    if (Number.isFinite(classId)) {
      const { data: me } = await supabase.auth.getUser();
      const uid = me?.user?.id;

      const { data: enrollment, error: enrollmentErr } = await supabase
        .schema("public")
        .from("enrollments")
        .select("class_id")
        .eq("class_id", classId)
        .eq("student_id", uid)
        .limit(1);
      if (enrollmentErr)
        return res.status(500).json({ error: enrollmentErr.message });
      if (!enrollment || enrollment.length === 0)
        return res.status(404).json({ error: "Not enrolled in this class" });
    }

    const { data: qids, error: qidErr } = await supabase
      .schema("public")
      .from("lesson_question_bank")
      .select("question_id")
      .eq("lesson_id", lessonId);
    if (qidErr) return res.status(500).json({ error: qidErr.message });
    if (!qids || qids.length === 0) return res.json({ questions: [] });

    const { data: questions, error: qErr } = await supabase
      .schema("public")
      .from("questions")
      .select("*")
      .in(
        "question_id",
        qids.map((q) => q.question_id),
      );

    if (qErr) return res.status(500).json({ error: qErr.message });

    return res.json({
      questions: (questions || []).map((q) => ({ ...q, lesson_id: lessonId })),
    });
  } catch (e) {
    console.error("mobile questions query route error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

// Fetch the first `limit` example questions for a given class + lesson, strictly scoped
async function getLessonExamples(
  adminClient,
  classIdMaybe,
  lessonKeyMaybe,
  limit = 3,
) {
  const examples = [];
  const classId = Number(classIdMaybe);
  if (!Number.isFinite(classId)) return examples;

  // Resolve lesson_id from numeric id or by name through class_lesson_bank (scoped to class)
  let lessonId = null;
  if (lessonKeyMaybe != null) {
    const keyStr = String(lessonKeyMaybe);
    if (/^\d+$/.test(keyStr)) {
      lessonId = Number(keyStr);
      // verify the lesson belongs to the class
      const { data: linkRows, error: linkErr } = await adminClient
        .schema("public")
        .from("class_lesson_bank")
        .select("lesson_id")
        .eq("class_id", classId)
        .eq("lesson_id", lessonId)
        .limit(1);
      if (linkErr || !linkRows || linkRows.length === 0) return examples;
    } else {
      const cleanedName = decodeURIComponent(keyStr).replace(/-/g, " ").trim();
      const { data: link, error: linkErr } = await adminClient
        .schema("public")
        .from("class_lesson_bank")
        .select("lesson_id, lessonDetails:lessons(name)")
        .eq("class_id", classId)
        .ilike("lessonDetails.name", cleanedName)
        .maybeSingle();
      if (linkErr || !link) return examples;
      lessonId = link.lesson_id;
    }
  }
  if (!Number.isFinite(Number(lessonId))) return examples;

  // 1) Get the first N question ids for that lesson, deterministic order
  // Prefer created_at if present. If not, use question_id ASC as a proxy for "first".
  let qids = [];
  {
    const { data: idRows, error: qidErr } = await adminClient
      .schema("public")
      .from("lesson_question_bank")
      .select("question_id")
      .eq("lesson_id", Number(lessonId))
      .order("question_id", { ascending: true })
      .limit(limit);

    if (qidErr || !idRows || idRows.length === 0) return examples;
    qids = idRows.map((r) => r.question_id);
  }

  // 2) Fetch those questions
  const { data: qs, error: qErr } = await adminClient
    .schema("public")
    .from("questions")
    .select("question_type, prompt, snippet, topics, answer_options, answer")
    .in("question_id", qids);

  if (qErr || !qs || qs.length === 0) return examples;

  const norm = (s) => (s == null ? "" : String(s));
  const toHyphen = (t) => {
    const s = typeof t === "string" ? t : "";
    return s.toLowerCase() === "multiple_choice" ? "multiple-choice" : s;
  };

  for (const q of qs) {
    examples.push({
      question_type: toHyphen(q.question_type),
      prompt: norm(q.prompt),
      snippet: q.snippet == null ? null : String(q.snippet),
      topics: Array.isArray(q.topics) ? q.topics.map(String) : [],
      answer_options: Array.isArray(q.answer_options) ? q.answer_options : [],
      answer: q.answer == null ? null : String(q.answer),
    });
  }

  return examples.slice(0, limit); // guard even though we already limited
}

/**
 * LLM endpoint (pure JS)
 * POST /llm/transform-question
 * Body: { provider: 'gemini', question: { question_type, prompt, snippet, topics, answer_options, answer } }
 * Returns: the SAME shape.
 */

app.post("/llm/transform-question", async (req, res) => {
  try {
    const mode =
      typeof req.body?.mode === "string" ? req.body.mode : "transform";
    const topic =
      req.body && typeof req.body.topic === "string"
        ? req.body.topic.trim()
        : null;
    const classIdForExamples = req.body?.class_id;
    const lessonForExamples =
      req.body?.lesson_id ?? req.body?.lesson_key ?? req.body?.lesson_name;
    const usedLessonKey =
      lessonForExamples != null ? String(lessonForExamples) : "";

    if (!process.env.GOOGLE_API_KEY) {
      console.error("[LLM CONFIG ERROR] Missing GOOGLE_API_KEY");
      return res
        .status(500)
        .json({ error: "Server not configured for Gemini (missing key)" });
    }

    if (
      mode === "generate" &&
      (classIdForExamples == null || lessonForExamples == null)
    ) {
      return res.status(400).json({
        error:
          "class_id and lesson_id|lesson_name are required for generate mode",
      });
    }

    // Optional: resolve class level from DB if class_id is provided
    let levelNum = 0;
    try {
      const classIdMaybe = req.body?.class_id;
      if (classIdMaybe != null) {
        const classId = Number(classIdMaybe);
        if (Number.isFinite(classId)) {
          const { data: cls, error: clsErr } = await admin
            .schema("public")
            .from("classes")
            .select("level")
            .eq("class_id", classId)
            .maybeSingle();
          if (!clsErr && cls && typeof cls.level === "number") {
            levelNum = cls.level;
          }
        }
      }
    } catch {}
    const levelText =
      ["intro", "foundational", "intermediate", "advanced"][levelNum] ||
      "intro";
    const difficultyHint = [
      `Target difficulty: ${levelText}.`,
      levelNum === 0
        ? "Use simple vocabulary and short prompts with simple code, questions akin to an introductory computer science class (1000 level classes)."
        : "",
      levelNum === 1
        ? "Assume basic familiarity with syntax, assume for classes with similar difficulty to an intro data structures or algorithms class (2000 level classes)."
        : "",
      levelNum === 2
        ? "Require small multi step reasoning with short code, think classes like an intro AI class or 3000 level curriculum."
        : "",
      levelNum === 3
        ? "Allow for more complex analysis of code, nothing insanely skilled but enough so a graduate student or advanced computer science student would be challenged (4000+ level classes)"
        : "",
    ]
      .filter(Boolean)
      .join(" ");

    // Pull first three examples strictly from this class + lesson
    let examples = [];
    try {
      examples = await getLessonExamples(
        admin,
        classIdForExamples,
        lessonForExamples,
        3,
      );
    } catch (e) {
      console.warn(
        "[LLM EXAMPLES DEBUG] getLessonExamples failed:",
        e?.message || e,
      );
    }

    console.log(
      "[LLM EXAMPLES DEBUG] class_id=%s lesson_key=%s examples_count=%d",
      classIdForExamples,
      usedLessonKey,
      Array.isArray(examples) ? examples.length : 0,
    );
    console.log(
      "[LLM EXAMPLES DEBUG] normalizedExamples (final, max3):",
      examples,
    );

    if (mode === "generate" && (!examples || examples.length === 0)) {
      return res
        .status(400)
        .json({ error: "No examples found for this class + lesson" });
    }

    console.log(
      "[LLM EXAMPLES DEBUG] source= %s, class_id=%s, lesson_key=%s",
      lessonForExamples.length ? "lesson" : "body",
      classIdForExamples,
      lessonForExamples,
    );

    // Logs to verify the actual examples being sent
    console.log(
      "[LLM EXAMPLES DEBUG] normalizedExamples (final, max3):",
      examples,
    );

    const {
      mode: _m,
      class_id,
      topic: _t,
      examples: _ex = [],
      ...rest
    } = req.body || {};
    const allowedFromExamples = collectExampleTopics(examples);

    // Strict: examples only. If there are no topics in examples, you must return topics: []
    const allowedList = allowedFromExamples;

    const topicsInstruction = allowedList.length
      ? `
You MUST choose topics ONLY from this allowed list and return them verbatim (case-insensitive match, return canonical casing from the list):
${allowedList.map((t) => `- ${t}`).join("\n")}
If none apply, return "topics": [] in the JSON.`.trim()
      : `
There are NO allowed topics. You MUST return "topics": [] in the JSON.`.trim();

    const q = req.body && req.body.question;
    if (mode === "transform" && (!q || typeof q !== "object")) {
      return res
        .status(400)
        .json({ error: "question is required in transform mode" });
    }

    const user =
      q && typeof q === "object"
        ? {
            question_type: String(q.question_type || ""),
            prompt: q.prompt == null ? "" : String(q.prompt),
            snippet: q.snippet == null ? null : String(q.snippet),
            topics: Array.isArray(q.topics) ? q.topics.map(String) : [],
            answer_options: q.answer_options == null ? [] : q.answer_options,
            answer: q.answer == null ? null : String(q.answer),
          }
        : {
            question_type: "",
            prompt: "",
            snippet: null,
            topics: [],
            answer_options: [],
            answer: null,
          };

    const sharedRules = [
      "Return a SINGLE JSON object with the SAME keys: question_type, prompt, snippet, topics, answer_options, answer.",
      "Keep topics aligned to the given topic if provided. If topics is empty and a topic exists, include [topic].",
      "Do not include extra keys. Do not wrap in markdown. Return ONLY JSON.",
    ].join(" ");

    const guidance =
      mode === "generate"
        ? [
            topic
              ? `Generate ONE new question focused on the topic "${topic}".`
              : "Generate ONE new question for an introductory CS topic.",
            difficultyHint,
            examples.length
              ? "Use these examples only as style and difficulty guides. Do not copy the questions themselves, but align the questions to the same topics as the examples."
              : "",
            "Prefer multiple_choice unless the examples suggest short_answer or rearrange.",
            sharedRules,
          ]
            .filter(Boolean)
            .join(" ")
        : [
            topic ? `If appropriate, align to topic "${topic}".` : "",
            difficultyHint,
            examples.length
              ? "Use these examples only as style and difficulty guides. Do not copy the questions themselves, but align the questions to the same topics as the examples."
              : "",
            "Normalize or improve the provided question but keep the same intent.",
            sharedRules,
          ]
            .filter(Boolean)
            .join(" ");

    // GEMINI ONLY
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const prompt = [
      "You are a careful assistant for quiz authoring. Output JSON only.",
      `Mode: ${mode}`,
      `Instruction: ${guidance}`,
      topicsInstruction, // enforce examples-only topics
      topic ? `Topic: ${topic}` : "",
      `Input: ${JSON.stringify(user)}`,
      `Examples: ${JSON.stringify(examples)}`,
    ]
      .filter(Boolean)
      .join("\n");

    const result = await model.generateContent(prompt);
    const resp = await result.response;
    const text = resp.text() || "";

    // Debug prompt and response
    console.log("[LLM PROMPT DEBUG]\\n", prompt.slice(0, 1200));
    console.log("[LLM RAW PREVIEW]", text.slice(0, 600));

    let llmJson;
    try {
      const rawBlock = extractJsonBlock(text);
      llmJson = JSON.parse(rawBlock);
    } catch (err) {
      console.error("[LLM JSON PARSE ERROR]", err?.message, {
        preview: text.slice(0, 600),
      });
      return res.status(400).json({ error: "Model did not return valid JSON" });
    }

    // Post-filter topics to examples-only list, case-insensitive mapping back to canonical
    let filteredTopics = [];
    if (Array.isArray(allowedList) && allowedList.length > 0) {
      const lowerAllowed = new Map(
        allowedList.map((t) => [t.toLowerCase(), t]),
      );
      const rawTopics = Array.isArray(llmJson.topics) ? llmJson.topics : [];
      filteredTopics = rawTopics
        .map((x) => String(x ?? "").trim())
        .filter(Boolean)
        .map((x) => lowerAllowed.get(x.toLowerCase()))
        .filter(Boolean);
    } else {
      filteredTopics = []; // strict: no topics allowed if examples had none
    }

    console.log("[LLM TOPICS DEBUG]", {
      allowedList,
      llmTopics: Array.isArray(llmJson.topics) ? llmJson.topics : [],
      filteredTopics,
    });

    // Debug what came back and what we keep
    console.log(
      "[LLM EXAMPLES DEBUG] source=lesson-only class_id=%s lesson_key=%s",
      classIdForExamples,
      usedLessonKey,
    );

    const out = {
      question_type:
        typeof llmJson.question_type === "string"
          ? llmJson.question_type
          : "multiple-choice",
      prompt: typeof llmJson.prompt === "string" ? llmJson.prompt : "",
      snippet:
        llmJson.snippet == null || llmJson.snippet === ""
          ? null
          : String(llmJson.snippet),

      // Strict: only filtered topics. No fallback to req.body.topic.
      topics: filteredTopics,

      answer_options: Array.isArray(llmJson.answer_options)
        ? llmJson.answer_options.map((o) => {
            if (typeof o === "string") return o;
            if (o && typeof o === "object") {
              const v =
                o.text ??
                o.label ??
                o.value ??
                o.option ??
                o.content ??
                o.title ??
                o.name;
              return typeof v === "string" ? v : JSON.stringify(o);
            }
            return String(o ?? "");
          })
        : [],
      answer: typeof llmJson.answer === "string" ? llmJson.answer : null,
    };

    return res.json(out);
  } catch (e) {
    console.error(
      "llm/transform-question error:",
      e?.message || e,
      e?.stack ? "\\n" + e.stack.split("\\n").slice(0, 4).join("\\n") : "",
    );
    return res.status(400).json({ error: e?.message || "Bad request" });
  }
});

// POST /update-node-progress
app.post("/user/update-node-progress", async (req, res) => {
  const supabase = createClient({ req, res });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const student_id = user.id;

  try {
    const {
      class_id,
      topics = [],
      attemptsDelta = 0,
      correctDelta = 0,
    } = req.body || {};

    if (!class_id || !Array.isArray(topics) || topics.length === 0) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const attDelta = Number(attemptsDelta) || 0;
    const corDelta = Number(correctDelta) || 0;
    if (attDelta < 0 || corDelta < 0 || corDelta > attDelta) {
      return res.status(400).json({ error: "Invalid deltas" });
    }

    for (const topic of topics) {
      const nodeLabel = String(topic || "").trim();
      if (!nodeLabel) continue;

      // read current row
      const { data: existing, error: readErr } = await admin
        .from("leitner_schedule")
        .select("total_attempts, total_correct, box, streak")
        .eq("student_id", student_id)
        .eq("class_id", class_id)
        .eq("node_label", nodeLabel)
        .maybeSingle();

      if (readErr) {
        console.error("[progress] read failed:", readErr);
        continue;
      }

      // starting values
      const prevAttempts = existing?.total_attempts || 0;
      const prevCorrect = existing?.total_correct || 0;
      let box = existing?.box || 1;
      let streak = existing?.streak || 0;

      // quiz-level outcome for this topic
      const quizAccuracy = attDelta > 0 ? corDelta / attDelta : 0;
      const passed = quizAccuracy >= 0.9;

      if (passed) {
        streak = streak + 1;
        box = Math.min(5, box + 1);
      } else {
        streak = 0;
        box = Math.max(1, box - 1);
      }

      const nextAttempts = prevAttempts + attDelta;
      const nextCorrect = prevCorrect + corDelta;

      const getNextReviewInterval = (box, passed) => {
        if (!passed) return 24 * 60 * 60 * 1000;
        const intervals = [
          1 * 24 * 60 * 60 * 1000, // Box 1
          2 * 24 * 60 * 60 * 1000, // Box 2
          3 * 24 * 60 * 60 * 1000, // Box 3
          5 * 24 * 60 * 60 * 1000, // Box 4
          7 * 24 * 60 * 60 * 1000, // Box 5
        ];

        return intervals[box - 1] || intervals[0];
      };

      const intervalMs = getNextReviewInterval(box, passed);

      const payload = {
        student_id,
        class_id,
        node_label: nodeLabel,
        total_attempts: nextAttempts,
        total_correct: nextCorrect,
        last_quiz_attempts: attDelta,
        last_quiz_correct: corDelta,
        last_reviewed: new Date().toISOString(),
        next_review: new Date(Date.now() + intervalMs).toISOString(),
        box,
        streak,
      };

      const { error: upsertErr } = await admin
        .from("leitner_schedule")
        .upsert(payload, { onConflict: "student_id,class_id,node_label" });

      if (upsertErr) {
        console.error("[progress] upsert failed:", upsertErr);
      }
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("[progress] unexpected error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

function getSortedReviewEntries(review) {
  if (!review || typeof review !== "object") return [];

  return Object.entries(review)
    .map(([topic, score]) => ({
      topic: String(topic),
      score: Number(score),
    }))
    .filter(({ topic, score }) => topic.trim() && Number.isFinite(score))
    .sort((a, b) => b.score - a.score || a.topic.localeCompare(b.topic));
}

async function buildReviewInputsForStudent(classIdNum, studentId) {
  const { data: classGraph, error: classGraphErr } = await admin
    .schema("public")
    .from("class_knowledge_graph")
    .select("react_flow_data")
    .eq("class_id", classIdNum)
    .maybeSingle();

  if (classGraphErr) {
    throw new Error(classGraphErr.message);
  }

  const rf = Array.isArray(classGraph?.react_flow_data)
    ? classGraph.react_flow_data[0]
    : null;

  const reactFlowNodes = rf?.reactFlowNodes || [];
  const reactFlowEdges = rf?.reactFlowEdges || [];

  const idToLabel = new Map();
  for (const n of reactFlowNodes) {
    const idNum = Number(n.id);
    if (!Number.isFinite(idNum)) continue;
    const label = n?.data?.label ?? String(n.id);
    idToLabel.set(idNum, String(label));
  }

  const nodes = Array.from(idToLabel.values());
  const edges = [];

  for (const e of reactFlowEdges) {
    const s = Number(e.source);
    const t = Number(e.target);
    const sl = idToLabel.get(s);
    const tl = idToLabel.get(t);
    if (!sl || !tl) continue;
    edges.push([sl, tl]);
  }

  const { data: performance, error: readErr } = await admin
    .schema("public")
    .from("leitner_schedule")
    .select(
      "student_id, node_label, total_correct, total_attempts, last_quiz_correct, last_quiz_attempts, box, next_review, class_id",
    )
    .eq("class_id", classIdNum);

  if (readErr) {
    throw new Error(readErr.message);
  }

  const studentMap = new Map();
  const currentStudentScheduleMeta = new Map();

  for (const row of performance || []) {
    const { student_id, node_label, total_attempts, total_correct } = row;
    const sid = String(student_id);
    const label = String(node_label || "").trim();
    if (!sid || !label) continue;

    if (!studentMap.has(sid)) {
      studentMap.set(sid, {});
    }

    const att = Number(total_attempts) || 0;
    const cor = Number(total_correct) || 0;
    const lastAtt = Number(row.last_quiz_attempts) || 0;
    const lastCor = Number(row.last_quiz_correct) || 0;

    const cumulativeAccuracy = att > 0 ? cor / att : 0;
    const recentAccuracy =
      lastAtt > 0
        ? Math.max(0, Math.min(1, lastCor / lastAtt))
        : cumulativeAccuracy;

    // Weight recent performance more heavily so recommendations react after review quizzes.
    const mastery = 0.3 * cumulativeAccuracy + 0.7 * recentAccuracy;

    studentMap.get(sid)[label] = mastery;

    if (sid === String(studentId)) {
      currentStudentScheduleMeta.set(label, {
        box: Number(row.box) || 0,
        nextReview: row.next_review ? String(row.next_review) : null,
      });
    }
  }

  return {
    nodes,
    edges,
    class_topic_progressions: Array.from(studentMap.values()),
    student_topic_progressions: studentMap.get(studentId) || {},
    current_student_schedule_meta: currentStudentScheduleMeta,
  };
}

// async function fetchReviewPrioritiesForStudent(classIdNum, studentId) {
//   const base = String(process.env.KG_REVIEW_URL || "").replace(/\/?$/, "");
//   if (!base) {
//     throw new Error("Missing KG_REVIEW_URL in server environment");
//   }

//   const payload = await buildReviewInputsForStudent(classIdNum, studentId);
//   const {
//     current_student_schedule_meta: currentStudentScheduleMeta,
//     ...ciapiPayload
//   } = payload;
//   const ciapiResp = await fetch(`${base}/review`, {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify(ciapiPayload),
//   });

//   if (!ciapiResp.ok) {
//     const txt = await ciapiResp.text().catch(() => "");
//     const err = new Error("Review service error");
//     err.status = ciapiResp.status;
//     err.details = txt.slice(0, 800);
//     throw err;
//   }

//   const review = await ciapiResp.json();
//   const adjustedReview = {};
//   const now = Date.now();

//   for (const [topic, score] of Object.entries(review || {})) {
//     const baseScore = Number(score);
//     if (!Number.isFinite(baseScore)) continue;

//     const meta = currentStudentScheduleMeta?.get?.(topic) || null;
//     let multiplier = 1;

//     if (meta) {
//       const box = Number(meta.box) || 0;
//       if (box === 1) multiplier += 0.15;
//       else if (box === 2) multiplier += 0.08;

//       const nextReviewMs = meta.nextReview
//         ? new Date(meta.nextReview).getTime()
//         : NaN;

//       if (Number.isFinite(nextReviewMs)) {
//         if (nextReviewMs <= now) {
//           multiplier += 0.2;
//         } else if (nextReviewMs - now <= 24 * 60 * 60 * 1000) {
//           multiplier += 0.08;
//         }
//       }
//     }

//     adjustedReview[topic] = baseScore * multiplier;
//   }

//   return adjustedReview;
// }

async function fetchReviewPrioritiesForStudent(classIdNum, studentId) {
  const base = String(process.env.KG_REVIEW_URL || "").replace(/\/?$/, "");
  if (!base) {
    throw new Error("Missing KG_REVIEW_URL in server environment");
  }

  const payload = await buildReviewInputsForStudent(classIdNum, studentId);
  const ciapiResp = await fetch(`${base}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!ciapiResp.ok) {
    const txt = await ciapiResp.text().catch(() => "");
    const err = new Error("Review service error");
    err.status = ciapiResp.status;
    err.details = txt.slice(0, 800);
    throw err;
  }

  return await ciapiResp.json();
}

async function persistReviewRecommendationSnapshot({
  studentId,
  classIdNum,
  sourceLessonSessionId = null,
  sourceLessonId = null,
  sourceReviewQuizSessionId = null,
  review,
  snapshotType = "post_lesson",
}) {
  const sortedEntries = getSortedReviewEntries(review);
  const top = sortedEntries[0] || null;

  const { data: snapshot, error: snapshotErr } = await admin
    .schema("public")
    .from("review_recommendation_snapshots")
    .insert([
      {
        student_id: studentId,
        class_id: classIdNum,
        source_lesson_session_id: sourceLessonSessionId,
        source_lesson_id: sourceLessonId,
        source_review_quiz_session_id: sourceReviewQuizSessionId,
        snapshot_type: snapshotType,
        top_topic: top?.topic ?? null,
        top_score: top?.score ?? null,
        review_map_json: review || {},
      },
    ])
    .select("id")
    .maybeSingle();

  if (snapshotErr) {
    throw new Error(snapshotErr.message);
  }

  if (sortedEntries.length > 0 && snapshot?.id) {
    const topicRows = sortedEntries.map(({ topic, score }, index) => ({
      snapshot_id: snapshot.id,
      topic,
      score,
      rank: index + 1,
    }));

    const { error: topicsErr } = await admin
      .schema("public")
      .from("review_recommendation_topics")
      .insert(topicRows);

    if (topicsErr) {
      throw new Error(topicsErr.message);
    }
  }

  return snapshot?.id ?? null;
}

// POST /user/lesson-complete
// Log a completed lesson attempt as a new row for scheduling / review analysis.
app.post("/user/lesson-complete", verifyUser, async (req, res) => {
  try {
    const supabase = createClient({ req, res });

    const {
      class_id,
      lesson_id,
      lesson_name,
      num_questions_total,
      num_correct,
    } = req.body || {};

    const classIdNum = Number(class_id);
    const lessonIdNum = Number(lesson_id);
    const totalNum = Number(num_questions_total);
    const correctNum = Number(num_correct);

    if (!Number.isFinite(classIdNum) || !Number.isFinite(lessonIdNum)) {
      return res.status(400).json({
        error: "class_id and lesson_id must be numbers",
      });
    }

    if (!Number.isFinite(totalNum) || totalNum < 0) {
      return res.status(400).json({
        error: "num_questions_total must be a non-negative number",
      });
    }

    if (
      !Number.isFinite(correctNum) ||
      correctNum < 0 ||
      correctNum > totalNum
    ) {
      return res.status(400).json({
        error: "num_correct must be between 0 and num_questions_total",
      });
    }

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return res.status(401).json({ error: "Not logged in." });
    }

    const studentId = user.id;

    // Validate enrollment
    const { data: enrollment, error: enrollmentErr } = await supabase
      .schema("public")
      .from("enrollments")
      .select("class_id")
      .eq("class_id", classIdNum)
      .eq("student_id", studentId)
      .limit(1);

    if (enrollmentErr) {
      return res.status(500).json({ error: enrollmentErr.message });
    }

    if (!enrollment || enrollment.length === 0) {
      return res.status(404).json({ error: "Not enrolled in this class" });
    }

    // Validate lesson belongs to class
    const { data: linkRows, error: linkErr } = await supabase
      .schema("public")
      .from("class_lesson_bank")
      .select("lesson_id")
      .eq("class_id", classIdNum)
      .eq("lesson_id", lessonIdNum)
      .limit(1);

    if (linkErr) {
      return res.status(500).json({ error: linkErr.message });
    }

    if (!linkRows || linkRows.length === 0) {
      return res.status(404).json({ error: "Lesson not found for class" });
    }

    const completedAt = new Date().toISOString();

    const { data: inserted, error: insertErr } = await supabase
      .schema("public")
      .from("student_lesson_sessions")
      .insert([
        {
          student_id: studentId,
          class_id: classIdNum,
          lesson_id: lessonIdNum,
          num_questions_total: totalNum,
          num_correct: correctNum,
          completed_at: completedAt,
        },
      ])
      .select("id")
      .maybeSingle();

    if (insertErr) {
      return res.status(500).json({ error: insertErr.message });
    }

    let reviewSnapshotId = null;
    let reviewSnapshotSaved = false;
    let reviewSnapshotError = null;

    try {
      if (!inserted?.id) {
        throw new Error("Missing lesson session id for review snapshot");
      }

      const review = await fetchReviewPrioritiesForStudent(
        classIdNum,
        studentId,
      );
      reviewSnapshotId = await persistReviewRecommendationSnapshot({
        studentId,
        classIdNum,
        sourceLessonSessionId: inserted.id,
        sourceLessonId: lessonIdNum,
        review,
      });
      reviewSnapshotSaved = true;
    } catch (snapshotErr) {
      reviewSnapshotError =
        snapshotErr?.message || "Failed to persist review snapshot";
      console.error("lesson-complete review snapshot error:", snapshotErr);
    }

    console.log("lesson-complete snapshot status", {
      classId: classIdNum,
      lessonId: lessonIdNum,
      studentId,
      sessionId: inserted?.id ?? null,
      reviewSnapshotSaved,
      reviewSnapshotId,
      reviewSnapshotError,
    });

    return res.status(200).json({
      success: true,
      session_id: inserted?.id ?? null,
      review_snapshot_saved: reviewSnapshotSaved,
      review_snapshot_id: reviewSnapshotId,
      review_snapshot_error: reviewSnapshotError,
    });
  } catch (err) {
    console.error("lesson-complete error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/user/enrolled-class/:id/review", async (req, res) => {
  try {
    const { id } = req.params;
    const classIdNum = Number(id);
    if (!Number.isFinite(classIdNum)) {
      return res.status(400).json({ error: "Class id must be a number" });
    }

    // Current user (student) id
    const supabaseReq = createClient({ req, res });
    const {
      data: { user },
      error: userErr,
    } = await supabaseReq.auth.getUser();
    if (userErr || !user) {
      return res.status(401).json({ error: "Not logged in." });
    }
    const currentStudentID = user.id;
    const latestSnapshot = await findLatestRecommendationSnapshot(
      currentStudentID,
      classIdNum,
    );

    if (!latestSnapshot?.review_map_json) {
      return res.status(200).json({
        class_id: classIdNum,
        student_id: currentStudentID,
        review: null,
        snapshot_id: null,
        snapshot_created_at: null,
        top_topic: null,
        top_score: null,
        source: "none",
        message:
          "Complete a lesson first to generate a personalized review plan.",
      });
    }

    if (latestSnapshot?.review_map_json) {
      return res.status(200).json({
        class_id: classIdNum,
        student_id: currentStudentID,
        review: latestSnapshot.review_map_json,
        snapshot_id: latestSnapshot.id,
        snapshot_created_at: latestSnapshot.created_at,
        top_topic: latestSnapshot.top_topic,
        top_score: latestSnapshot.top_score,
        source: "snapshot",
      });
    }
  } catch (e) {
    if (e?.message === "Review service error") {
      return res.status(502).json({
        error: "Review service error",
        status: e?.status ?? 500,
        details: e?.details ?? "",
      });
    }
    console.error("/user/enrolled-class/:id/review error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

function pickTopReviewTopic(review) {
  if (!review || typeof review !== "object") return null;
  let bestTopic = null;
  let bestScore = -Infinity;
  for (const [topic, score] of Object.entries(review)) {
    const s = Number(score);
    if (!Number.isFinite(s)) continue;
    if (s > bestScore) {
      bestScore = s;
      bestTopic = topic;
    }
  }
  return bestTopic ? { topic: bestTopic, score: bestScore } : null;
}

async function findLatestRecommendationSnapshot(studentId, classIdNum) {
  const { data: snapshot, error } = await admin
    .schema("public")
    .from("review_recommendation_snapshots")
    .select("id, created_at, top_topic, top_score, review_map_json")
    .eq("student_id", studentId)
    .eq("class_id", classIdNum)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return snapshot ?? null;
}

app.post("/user/enrolled-class/:id/quiz", async (req, res) => {
  try {
    const { id } = req.params;
    const classIdNum = Number(id);
    if (!Number.isFinite(classIdNum)) {
      return res.status(400).json({ error: "Class id must be a number" });
    }

    // Authenticated user
    const supabase = createClient({ req, res });
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return res.status(401).json({ error: "Not logged in." });
    }

    // Enrollment check
    const { data: enrollment, error: enrollmentErr } = await supabase
      .schema("public")
      .from("enrollments")
      .select("class_id")
      .eq("class_id", classIdNum)
      .eq("student_id", user.id)
      .limit(1);

    if (enrollmentErr) {
      return res.status(500).json({ error: enrollmentErr.message });
    }
    if (!enrollment || enrollment.length === 0) {
      return res.status(404).json({ error: "Not enrolled in this class" });
    }

    // The client should pass the review map returned by GET /user/enrolled-class/:id/review
    // Body: { review: { [topicLabel]: number }, num_questions?: number }
    const review = req.body?.review;
    const top = pickTopReviewTopic(review);
    if (!top) {
      return res
        .status(400)
        .json({ error: "Missing or invalid review map in request body" });
    }

    const requestedN = Number(req.body?.num_questions);
    const numQuestions =
      Number.isFinite(requestedN) && requestedN > 0
        ? Math.min(15, requestedN)
        : 10;

    // 1) Get lesson ids in this class
    const { data: clb, error: clbErr } = await admin
      .schema("public")
      .from("class_lesson_bank")
      .select("lesson_id")
      .eq("class_id", classIdNum);

    if (clbErr) {
      return res.status(500).json({ error: clbErr.message });
    }

    const lessonIds = (clb || [])
      .map((r) => r.lesson_id)
      .filter((x) => Number.isFinite(Number(x)));
    if (lessonIds.length === 0) {
      return res.status(200).json({
        class_id: classIdNum,
        student_id: user.id,
        topic: top.topic,
        score: top.score,
        questions: [],
      });
    }

    // 2) Get question ids for those lessons
    const { data: lqb, error: lqbErr } = await admin
      .schema("public")
      .from("lesson_question_bank")
      .select("question_id")
      .in("lesson_id", lessonIds);

    if (lqbErr) {
      return res.status(500).json({ error: lqbErr.message });
    }

    const qids = Array.from(
      new Set(
        (lqb || [])
          .map((r) => r.question_id)
          .filter((x) => Number.isFinite(Number(x))),
      ),
    );

    if (qids.length === 0) {
      return res.status(200).json({
        class_id: classIdNum,
        student_id: user.id,
        topic: top.topic,
        score: top.score,
        questions: [],
      });
    }

    // 3) Pull questions that include the chosen topic
    const { data: questions, error: qErr } = await admin
      .schema("public")
      .from("questions")
      .select("*")
      .in("question_id", qids)
      .contains("topics", [top.topic]);

    if (qErr) {
      return res.status(500).json({ error: qErr.message });
    }

    const pool = Array.isArray(questions) ? questions : [];

    // Random sample without replacement
    const shuffled = pool.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = shuffled[i];
      shuffled[i] = shuffled[j];
      shuffled[j] = tmp;
    }
    const picked = shuffled.slice(0, Math.min(numQuestions, shuffled.length));

    let reviewQuizSessionId = null;
    if (picked.length > 0) {
      try {
        const latestSnapshot = await findLatestRecommendationSnapshot(
          user.id,
          classIdNum,
        );
        const questionIds = picked
          .map((q) => q?.question_id)
          .filter((qid) => Number.isFinite(Number(qid)));

        const { data: reviewQuizSession, error: reviewQuizSessionErr } =
          await admin
            .schema("public")
            .from("review_quiz_sessions")
            .insert([
              {
                student_id: user.id,
                class_id: classIdNum,
                snapshot_id: latestSnapshot?.id ?? null,
                topic_served: top.topic,
                score_at_selection: top.score,
                num_questions: picked.length,
                question_ids_json: questionIds,
                status: "started",
              },
            ])
            .select("id")
            .maybeSingle();

        if (reviewQuizSessionErr) {
          throw new Error(reviewQuizSessionErr.message);
        }

        reviewQuizSessionId = reviewQuizSession?.id ?? null;
      } catch (reviewQuizSessionErr) {
        console.error(
          "review quiz session insert failed:",
          reviewQuizSessionErr,
        );
      }
    }

    return res.status(200).json({
      class_id: classIdNum,
      student_id: user.id,
      topic: top.topic,
      score: top.score,
      questions: picked,
      review_quiz_session_id: reviewQuizSessionId,
    });
  } catch (e) {
    console.error("/user/enrolled-class/:id/quiz error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/user/review-quiz-complete", async (req, res) => {
  try {
    const supabase = createClient({ req, res });
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return res.status(401).json({ error: "Not logged in." });
    }

    const reviewQuizSessionId = String(
      req.body?.review_quiz_session_id || "",
    ).trim();
    const numCorrect = Number(req.body?.num_correct);

    if (!reviewQuizSessionId) {
      return res
        .status(400)
        .json({ error: "review_quiz_session_id is required" });
    }

    if (!Number.isFinite(numCorrect) || numCorrect < 0) {
      return res
        .status(400)
        .json({ error: "num_correct must be a non-negative number" });
    }

    const { data: existingSession, error: readErr } = await admin
      .schema("public")
      .from("review_quiz_sessions")
      .select("id, student_id, num_questions, class_id")
      .eq("id", reviewQuizSessionId)
      .maybeSingle();

    if (readErr) {
      return res.status(500).json({ error: readErr.message });
    }

    if (!existingSession) {
      return res.status(404).json({ error: "Review quiz session not found" });
    }

    if (String(existingSession.student_id) !== String(user.id)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const totalQuestions = Number(existingSession.num_questions);
    if (!Number.isFinite(totalQuestions) || numCorrect > totalQuestions) {
      return res.status(400).json({
        error: "num_correct must be between 0 and num_questions",
      });
    }

    const completedAt = new Date().toISOString();
    const { error: updateErr } = await admin
      .schema("public")
      .from("review_quiz_sessions")
      .update({
        num_correct: numCorrect,
        completed_at: completedAt,
        status: "completed",
      })
      .eq("id", reviewQuizSessionId)
      .eq("student_id", user.id);

    if (updateErr) {
      return res.status(500).json({ error: updateErr.message });
    }

    let reviewSnapshotId = null;
    let reviewSnapshotSaved = false;
    let reviewSnapshotError = null;

    try {
      const classIdNum = Number(existingSession.class_id);
      if (!Number.isFinite(classIdNum)) {
        throw new Error("Review quiz session is missing a valid class_id");
      }

      const review = await fetchReviewPrioritiesForStudent(classIdNum, user.id);
      reviewSnapshotId = await persistReviewRecommendationSnapshot({
        studentId: user.id,
        classIdNum,
        sourceReviewQuizSessionId: reviewQuizSessionId,
        review,
        snapshotType: "post_review_quiz",
      });
      reviewSnapshotSaved = true;
    } catch (snapshotErr) {
      reviewSnapshotError =
        snapshotErr?.message || "Failed to persist post-review snapshot";
      console.error("review-quiz-complete snapshot error:", snapshotErr);
    }

    console.log("review-quiz-complete snapshot status", {
      classId: Number(existingSession.class_id),
      studentId: user.id,
      reviewQuizSessionId,
      reviewSnapshotSaved,
      reviewSnapshotId,
      reviewSnapshotError,
    });

    return res.status(200).json({
      success: true,
      review_quiz_session_id: reviewQuizSessionId,
      review_snapshot_saved: reviewSnapshotSaved,
      review_snapshot_id: reviewSnapshotId,
      review_snapshot_error: reviewSnapshotError,
    });
  } catch (e) {
    console.error("/user/review-quiz-complete error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});
/**
 * TODOs:
 * - /enroll: enroll a student in a class (POST)
 * - /drop-class: drop a class for a student (DELETE)
 *
 * - /students: get all students (GET)
 * - /students/update/:id: update a student (PATCH)
 * - /students/:id/classes/remove: remove a class from a student (DELETE) ...probably not needed
 */

export default app;
