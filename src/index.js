import express from 'express'
import { createClient } from '../util/subabase.js'
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import { GoogleGenerativeAI } from '@google/generative-ai'
// import scheduler from '../routes/schedule.js'
// import progressRouter from '../routes/progress.js'

const app = express()

import cors from 'cors'

// top of src/index.js
const allowlist = ['http://localhost:3000', 'http://localhost:3001']
const vercelRegex = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true)
      if (allowlist.includes(origin) || vercelRegex.test(origin)) return cb(null, true)
      return cb(new Error('CORS blocked'), false)
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
  })
)
app.options('*', cors())

// Robustly extract a JSON block from an LLM response
function extractJsonBlock(s) {
  if (typeof s !== 'string') return ''
  // 1) fenced ```json ... ```
  const fenceJson = s.match(/```json\s*([\s\S]*?)\s*```/i)
  if (fenceJson && fenceJson[1]) return fenceJson[1]
  // 2) any fenced ``` ... ```
  const fenceAny = s.match(/```\s*([\s\S]*?)\s*```/)
  if (fenceAny && fenceAny[1]) return fenceAny[1]
  // 3) first balanced { ... }
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start !== -1 && end > start) return s.slice(start, end + 1)
  return s.trim()
}

// Admin Supabase client for trusted reads in public schema
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server env
const admin = createSupabaseAdminClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/**
 * Middleware functions
 */

// Middleware to parse JSON request body
app.use(express.json())

const verifyUser = async (req, res, next) => {
  const supabase = createClient({ req, res })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return res.status(401).json({ error: 'Not logged in.' })
  }

  // user is logged in
  next()
}
//collect examples
function collectExampleTopics(examples) {
  const set = new Set()
  if (Array.isArray(examples)) {
    for (const ex of examples) {
      const tlist = Array.isArray(ex?.topics) ? ex.topics : []
      for (const t of tlist) {
        const s = String(t ?? '').trim()
        if (s) set.add(s)
      }
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

// Public graph route (no auth cookie required) **NEW**
app.get('/public/class/:id/knowledge-graph', async (req, res) => {
  try {
    const { id } = req.params

    // Accept either numeric class_id or a slug/name (e.g. "demo-class")
    let classIdNum = Number(id)
    if (!Number.isFinite(classIdNum)) {
      const cleaned = decodeURIComponent(String(id)).replace(/-/g, ' ').trim()
      const { data: cls, error: clsErr } = await admin
        .schema('public')
        .from('classes')
        .select('class_id')
        .ilike('name', cleaned)
        .maybeSingle()

      if (clsErr) {
        console.error('Classes lookup error:', clsErr.message)
        return res.status(500).json({ error: clsErr.message })
      }
      if (!cls) {
        // No such class — return empty graph so clients can render gracefully
        return res.status(200).json({ nodes: [], edges: [], trackingThreshold: 10 })
      }
      classIdNum = Number(cls.class_id)
    }

    const { data: classGraph, error: classGraphErr } = await admin
      .schema('public')
      .from('class_knowledge_graph')
      .select('react_flow_data')
      .eq('class_id', classIdNum)
      .maybeSingle()

    // If row not found, return 200 with empty graph
    if (classGraphErr) {
      console.warn('Class graph lookup warning:', classGraphErr)
      return res.status(200).json({ nodes: [], edges: [], trackingThreshold: 10 })
    }
    if (!classGraph) {
      return res.status(200).json({ nodes: [], edges: [], trackingThreshold: 10 })
    }

    const rf = Array.isArray(classGraph?.react_flow_data) ? classGraph.react_flow_data[0] : null
    if (!rf || !rf.reactFlowNodes || !rf.reactFlowEdges) {
      return res.status(200).json({ nodes: [], edges: [], trackingThreshold: 10 })
    }

    const reactFlowNodes = rf.reactFlowNodes || []
    const reactFlowEdges = rf.reactFlowEdges || []

    const nodes = reactFlowNodes
      .map(n => {
        const idNum = Number(n.id)
        const label = n?.data?.label ?? String(n.id)
        const position = n?.position || { x: 0, y: 0 }
        const correctResponses = Number(n?.data?.correctResponses) || 0
        const occurrences = Number(n?.data?.occurrences) || 0
        return { id: idNum, label, position, correctResponses, occurrences, isActive: true }
      })
      .sort((a, b) => a.id - b.id)

    const edges = reactFlowEdges.map(e => ({
      source: Number(e.source),
      target: Number(e.target),
    }))

    return res.status(200).json({ nodes, edges, trackingThreshold: 10 })
  } catch (e) {
    console.error('public knowledge-graph endpoint error:', e)
    return res.status(500).json({ error: 'Server error' })
  }
})

app.use('/user', verifyUser)

/**
 * Test route to check if the server is running
 */
app.get('/', async (req, res) => {
  res.status(200).send('IT WORKS 😊')
})

/**
 * Logs the user in given the email and password
 * and returns a 200 status code if successful
 */
app.post('/login', async (req, res) => {
  const { email, password } = req.body

  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Please provide valid email or password' })
  }

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' })
  }

  const supabase = createClient({ req, res })
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  })

  if (error) {
    return res.status(401).json({ error: error.message })
  }

  // Return the session so mobile can use it
  return res.status(200).json({
    message: 'Logged in!',
    session: data.session,
    user: data.user,
  })
})

/**
 * Registers a new user given email and password
 * and returns a 201 status code if successful
 */
app.post('/register', async (req, res) => {
  const { email, password, displayName } = req.body

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' })
  }

  const supabase = createClient({ req, res })
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      data: {
        displayName: typeof displayName === 'string' ? displayName : null,
      },
    },
  })

  if (error) {
    return res.status(400).json({ error: error.message })
  }
  // Create or update the student's profile row immediately after signup
  // Use the admin client so this works even if email confirmation prevents a session
  try {
    const newUser = data?.user
    if (newUser && newUser.id) {
      const displayNameSafe = typeof displayName === 'string' ? displayName : null
      const { error: upsertErr } = await admin
        .schema('public')
        .from('students')
        .upsert(
          {
            student_id: newUser.id,
            email: newUser.email ?? null,
            display_name: displayNameSafe,
            consent: Boolean(req.body?.consent),
            over_18: Boolean(req.body?.isOver18),
          },
          { onConflict: 'student_id' }
        )

      if (upsertErr) {
        console.error('students upsert after signup failed:', upsertErr.message)
        // Do not fail registration; surface a soft warning for observability
      }
    }
  } catch (e) {
    console.error('students upsert exception:', e)
  }

  return res.status(201).json({ message: 'User registered!', user: data.user })
})

app.post('/logout', async (req, res) => {
  const supabase = createClient({ req, res })
  const { error } = await supabase.auth.signOut()

  return error ? res.status(500).json({ error: error.message }) : res.status(204).send()
})

/**
 * Gets the account information of the student
 * given the user is logged in
 */
app.get('/user/account-info', async (req, res) => {
  const supabase = createClient({ req, res })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  return !user
    ? res.status(401).json({ error: 'Not logged in.' })
    : res.status(200).json({
        userID: user.id,
        email: user.email,
        displayName: user.user_metadata?.displayName || null,
      })
})

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
app.get('/user/enrolled-classes', async (req, res) => {
  const supabase = createClient({ req, res })

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError || !user) {
    return res.status(401).json({ error: 'Not logged in.' })
  }

  const { data: enrolledClasses, error } = await supabase
    .schema('public')
    .from('enrollments')
    .select('class_id')
    .eq('student_id', user.id)

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  const classIDs = (enrolledClasses || []).map(enrollment => enrollment.class_id)
  if (classIDs.length === 0) return res.status(200).json([])

  const { data: classes, error: classesError } = await supabase
    .schema('public')
    .from('classes')
    .select('*')
    .in('class_id', classIDs)

  if (classesError) {
    return res.status(500).json({ error: classesError.message })
  }

  return res.status(200).json(classes)
})

/**
 * Gets a specific class that a student is enrolled in
 * given the class ID and if the student is logged in
 */
app.get('/user/enrolled-class/:id', async (req, res) => {
  const supabase = createClient({ req, res })

  const { id } = req.params
  const { data: enrolledClass, error } = await supabase
    .schema('public')
    .from('classes')
    .select('*')
    .eq('class_id', id)

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  return res.status(200).json(enrolledClass)
})

/**
 * Gets all lessons for a specific class that a student is enrolled in
 * given the class ID and if the student is logged in
 */
app.get('/user/enrolled-class/:id/lessons', async (req, res) => {
  const supabase = createClient({ req, res })

  // validate class ID input
  const { id } = req.params
  if (!id) {
    return res.status(400).json({ error: 'Class ID is required' })
  }

  const idAsNum = parseInt(id)
  if (!Number.isFinite(idAsNum)) {
    return res.status(400).json({ error: 'Class ID must be a number' })
  }

  const { data: enrollment, error: enrollmentError } = await supabase
    .schema('public')
    .from('enrollments')
    .select('class_id')
    .eq('class_id', idAsNum)
    .limit(1)

  if (enrollmentError) {
    return res.status(500).json({ error: enrollmentError.message })
  } else if (!enrollment || enrollment.length === 0) {
    return res.status(404).json({ error: 'Not enrolled in this class' })
  }

  const { data: lessons, error: lessonsError } = await supabase
    .schema('public')
    .from('class_lesson_bank')
    .select(
      `
    lesson_id,
    lessonDetails:lessons(name, topics)
  `
    )
    .eq('class_id', idAsNum)

  if (lessonsError) {
    return res.status(500).json({ error: lessonsError.message })
  }

  const formattedLessons = lessons.map(lesson => {
    return {
      lesson_id: lesson.lesson_id,
      name: lesson.lessonDetails.name,
      topics: lesson.lessonDetails.topics,
    }
  })

  return res.status(200).json(formattedLessons)
})

/**
 * Gets a specific lesson for a class that a student is enrolled in
 * given the class ID and lesson ID and if the student is logged in
 */
app.get('/user/enrolled-class/:id/lesson/:lessonID', async (req, res) => {
  const supabase = createClient({ req, res })

  const { id, lessonID } = req.params
  if (!id || !lessonID) {
    return res.status(400).json({ error: 'Class ID and Lesson ID are required' })
  }

  const { data, error } = await supabase
    .schema('public')
    .from('classes')
    .select('*')
    .eq('class_id', id)

  if (error) {
    return res.status(500).json({ error: error.message })
  } else if (data.length === 0) {
    return res.status(404).json({ error: 'Class not found' })
  }

  const { data: lesson, error: lessonError } = await supabase
    .schema('public')
    .from('lessons')
    .select('*')
    .eq('lesson_id', lessonID)

  if (lessonError) {
    return res.status(500).json({ error: lessonError.message })
  }

  return res.status(200).json(lesson)
})

/**
 * Gets questions for a specific lesson for a class that a student is enrolled in
 * given the class ID and lesson ID and if the student is logged in
 */
app.get('/user/enrolled-class/:id/lesson/:lessonID/questions', async (req, res) => {
  const supabase = createClient({ req, res })

  const { id, lessonID } = req.params
  const classIdNum = Number(id)
  const lessonIdNum = Number(lessonID)
  if (!Number.isFinite(classIdNum) || !Number.isFinite(lessonIdNum)) {
    return res.status(400).json({ error: 'Class ID and Lesson ID must be numbers' })
  }

  // checking to make sure the class and lesson exist AND
  // that the lesson is part of the class
  const { data, error } = await supabase
    .schema('public')
    .from('class_lesson_bank')
    .select('class_id, lesson_id')
    .eq('class_id', classIdNum)
    .eq('lesson_id', lessonIdNum)

  if (error) {
    return res.status(500).json({ error: error.message })
  } else if (data.length === 0) {
    return res.status(404).json({ error: 'Class or Lesson not found' })
  }

  // fetching question IDs for the lesson
  const { data: questionIDs, error: questionIDsError } = await supabase
    .schema('public')
    .from('lesson_question_bank')
    .select('*')
    .eq('lesson_id', lessonID)

  if (questionIDsError) {
    return res.status(500).json({ error: questionIDsError.message })
  }

  // fetching questions based on the question IDs
  const ids = questionIDs.map(question => question.question_id)
  const { data: questions, error: questionsError } = await supabase
    .schema('public')
    .from('questions')
    .select('*')
    .in('question_id', ids)

  if (questionsError) {
    return res.status(500).json({ error: questionsError.message })
  }

  return res.status(200).json({
    questions: (questions || []).map(q => ({ ...q, lesson_id: lessonIdNum })),
  })
})

app.get('/user/enrolled-class/:id/knowledge-graph', async (req, res) => {
  try {
    const { id } = req.params
    const DEFAULT_HALF_LIFE_DAYS = 5

    // Accept numeric id or slug/name
    let classIdNum = Number(id)
    // get current user id from the request bound supabase client
    const supabaseReq = createClient({ req, res })
    const { data: me } = await supabaseReq.auth.getUser()
    const uid = me?.user?.id || null

    if (!Number.isFinite(classIdNum)) {
      const cleaned = decodeURIComponent(String(id)).replace(/-/g, ' ').trim()
      const { data: cls, error: clsErr } = await admin
        .schema('public')
        .from('classes')
        .select('class_id')
        .ilike('name', cleaned)
        .maybeSingle()

      if (clsErr) {
        console.error('Classes lookup error:', clsErr.message)
        return res.status(500).json({ error: clsErr.message })
      }
      if (!cls) {
        return res.status(200).json({ nodes: [], edges: [], trackingThreshold: 10 })
      }
      classIdNum = Number(cls.class_id)
    }

    // 1) Read the class-level graph (admin client to avoid RLS surprises)
    const { data: classGraph, error: classGraphErr } = await admin
      .schema('public')
      .from('class_knowledge_graph')
      .select('react_flow_data')
      .eq('class_id', classIdNum)
      .maybeSingle()

    if (classGraphErr) {
      console.warn('Class graph lookup warning:', classGraphErr)
      return res.status(200).json({ nodes: [], edges: [], trackingThreshold: 10 })
    }
    if (!classGraph) {
      return res.status(200).json({ nodes: [], edges: [], trackingThreshold: 10 })
    }

    const rf = Array.isArray(classGraph?.react_flow_data) ? classGraph.react_flow_data[0] : null
    if (!rf || !rf.reactFlowNodes || !rf.reactFlowEdges) {
      return res.status(200).json({ nodes: [], edges: [], trackingThreshold: 10 })
    }

    // 2) Find active topics from active lessons for this class
    const { data: clb, error: clbError } = await admin
      .schema('public')
      .from('class_lesson_bank')
      .select('lesson_id')
      .eq('class_id', classIdNum)

    if (clbError) {
      console.error('Class lesson bank error:', clbError.message)
      return res.status(500).json({ error: clbError.message })
    }

    const lessonIds = (clb || []).map(l => l.lesson_id)

    let uniqueActiveTopics = new Set()
    if (lessonIds.length > 0) {
      const { data: activeTopics, error: activeTopicsError } = await admin
        .schema('public')
        .from('lessons')
        .select('topics')
        .in('lesson_id', lessonIds)

      if (activeTopicsError) {
        console.error('Lessons error:', activeTopicsError.message)
        return res.status(500).json({ error: activeTopicsError.message })
      }

      uniqueActiveTopics = new Set((activeTopics || []).flatMap(t => t.topics))
    }

    // pull per student totals from node_schedule for this class
    let totalsByLabel = new Map()
    if (uid) {
      const { data: schedRows, error: schedErr } = await admin
        .schema('public')
        .from('leitner_schedule')
        .select(
          'node_label, total_attempts, total_correct, last_reviewed, last_quiz_attempts, last_quiz_correct'
        )
        .eq('class_id', classIdNum)
        .eq('student_id', uid)

      if (!schedErr && Array.isArray(schedRows)) {
        for (const r of schedRows) {
          const key = String(r.node_label || '')
            .trim()
            .toLowerCase()
          if (!key) continue
          totalsByLabel.set(key, {
            attempts: Number(r.total_attempts) || 0,
            correct: Number(r.total_correct) || 0,
            lastReviewed: r.last_reviewed ? String(r.last_reviewed) : null,
            lastQuizAttempts: Number(r.last_quiz_attempts) || 0,
            lastQuizCorrect: Number(r.last_quiz_correct) || 0,
          })
        }
      }
    }

    // 3) Optional per-student overrides like tracking threshold
    //    Try student_knowledge_graph, but fall back to 10 if not present.
    let trackingThreshold = 10
    try {
      const { data: skg } = await admin
        .schema('public')
        .from('student_knowledge_graph')
        .select('tracking_threshold')
        .eq('class_id', classIdNum)
        .limit(1)
        .maybeSingle()
      if (skg && typeof skg.tracking_threshold === 'number') {
        trackingThreshold = skg.tracking_threshold
      }
    } catch {}

    // 4) Map React Flow structures to the mobile shape
    const reactFlowNodes = rf.reactFlowNodes || []
    const reactFlowEdges = rf.reactFlowEdges || []

    const nodes = reactFlowNodes
      .map(n => {
        const idNum = Number(n.id)
        const label = n?.data?.label ?? String(n.id)
        const position = n?.position || { x: 0, y: 0 }
        const isActive = uniqueActiveTopics.has(label)

        // defaults from class graph
        const cgCorrect = 0
        const cgOcc = 0

        // override with per-student totals if present
        const t = totalsByLabel.get(String(label).trim().toLowerCase())
        const occurrences = t ? Math.max(0, t.attempts) : 0
        const correctResponses = t ? Math.max(0, t.correct) : 0

        return {
          id: idNum,
          label,
          position,
          correctResponses,
          occurrences,
          isActive,
          // new optional fields for decay on client
          lastReviewed: t ? t.lastReviewed : null,
          lastQuizAttempts: t ? t.lastQuizAttempts : 0,
          lastQuizCorrect: t ? t.lastQuizCorrect : 0,
        }
      })
      .sort((a, b) => a.id - b.id)

    const edges = reactFlowEdges.map(e => ({
      source: Number(e.source),
      target: Number(e.target),
    }))

    return res
      .status(200)
      .json({ nodes, edges, trackingThreshold, halfLifeDays: DEFAULT_HALF_LIFE_DAYS })
  } catch (e) {
    console.error('knowledge-graph endpoint error:', e)
    return res.status(500).json({ error: 'Server error' })
  }
})

/**
 * Enroll the current user into a class using a 6-digit invite code
 */

// ...

app.post('/user/join-class', async (req, res) => {
  try {
    // cookie-bound user for auth
    const supabase = createClient({ req, res })
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError || !user) {
      return res.status(401).json({ success: false, error: 'Not logged in.' })
    }

    // normalize 6-char alphanumeric code
    const raw = String(req.body?.code || '')
    const code = raw.replace(/[^a-z0-9]/gi, '').toUpperCase()
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      return res
        .status(400)
        .json({ success: false, error: 'Code must be 6 alphanumeric characters' })
    }

    // trusted reads with service role

    // 1) class_codes lookup in public
    const { data: codeRows, error: codeErr } = await admin
      .schema('public')
      .from('class_codes')
      .select('class_code_id, class_code, expires_at, class_id')
      .eq('class_code', code)
      .order('expires_at', { ascending: false })
      .limit(1)

    if (codeErr) {
      return res.status(500).json({ success: false, error: codeErr.message })
    }
    const codeRow = Array.isArray(codeRows) ? codeRows[0] : null
    if (!codeRow) {
      return res.status(404).json({ success: false, error: 'Invalid code' })
    }
    if (codeRow.expires_at && new Date(codeRow.expires_at) <= new Date()) {
      return res.status(410).json({ success: false, error: 'Code expired' })
    }

    // 2) class lookup in public
    const classIdNum = Number(codeRow.class_id)
    const { data: classRows, error: classErr } = await admin
      .schema('public')
      .from('classes')
      .select('class_id, name')
      .eq('class_id', classIdNum)
      .limit(1)

    if (classErr) {
      return res.status(500).json({ success: false, error: classErr.message })
    }
    const cls = Array.isArray(classRows) ? classRows[0] : null
    if (!cls) {
      return res.status(404).json({ success: false, error: 'Class not found' })
    }

    // 3) check existing enrollment and insert with request client
    const { data: existing, error: existErr } = await supabase
      .schema('public')
      .from('enrollments')
      .select('class_id')
      .eq('class_id', cls.class_id)
      .eq('student_id', user.id) // use student_id and the current user's UID
      .maybeSingle()

    if (existErr) {
      return res.status(500).json({ success: false, error: existErr.message })
    }
    if (existing) {
      return res.status(200).json({
        success: true,
        message: 'Already enrolled',
        class: { id: cls.class_id, name: cls.name },
      })
    }

    const { error: enrollErr } = await supabase
      .schema('public')
      .from('enrollments')
      .insert([{ class_id: cls.class_id, student_id: user.id }]) // write to student_id

    if (enrollErr) {
      return res.status(500).json({ success: false, error: enrollErr.message })
    }

    return res.status(200).json({
      success: true,
      message: 'Enrolled successfully',
      class: { id: cls.class_id, name: cls.name },
    })
  } catch (e) {
    console.error('join-class error:', e)
    return res.status(500).json({ success: false, error: 'Server error' })
  }
})

/**
 * Mobile-friendly questions endpoints
 * Accept lesson by id or slug. Require auth and validate enrollment.
 */

// GET /mobile/classes/:classId/lessons/:lessonKey/questions
app.get('/mobile/classes/:classId/lessons/:lessonKey/questions', verifyUser, async (req, res) => {
  try {
    const supabase = createClient({ req, res })
    const { classId, lessonKey } = req.params
    const { data: me } = await supabase.auth.getUser()
    const uid = me?.user?.id

    // 1) Validate enrollment for this class
    const { data: enrollment, error: enrollmentErr } = await supabase
      .schema('public')
      .from('enrollments')
      .select('class_id')
      .eq('class_id', Number(classId))
      .eq('student_id', uid)
      .limit(1)

    if (enrollmentErr) return res.status(500).json({ error: enrollmentErr.message })
    if (!enrollment || enrollment.length === 0)
      return res.status(404).json({ error: 'Not enrolled in this class' })

    // 2) Resolve lesson_id for this class using id or slug/name
    let lessonId = null
    if (/^\d+$/.test(String(lessonKey))) {
      lessonId = Number(lessonKey)
      // Ensure the lesson belongs to the class
      const { data: linkRows, error: linkErr } = await supabase
        .schema('public')
        .from('class_lesson_bank')
        .select('lesson_id')
        .eq('class_id', Number(classId))
        .eq('lesson_id', lessonId)
        .limit(1)
      if (linkErr) return res.status(500).json({ error: linkErr.message })
      if (!linkRows || linkRows.length === 0)
        return res.status(404).json({ error: 'Lesson not found for class' })
    } else {
      const cleanedName = decodeURIComponent(String(lessonKey)).replace(/-/g, ' ').trim()
      const { data: link, error: linkErr } = await supabase
        .schema('public')
        .from('class_lesson_bank')
        .select('lesson_id, lessonDetails:lessons(name)')
        .eq('class_id', Number(classId))
        .ilike('lessonDetails.name', cleanedName)
        .maybeSingle()
      if (linkErr) return res.status(500).json({ error: linkErr.message })
      if (!link) return res.status(404).json({ error: 'Lesson not found for class' })
      lessonId = link.lesson_id
    }

    // 3) Fetch question ids for that lesson
    const { data: qids, error: qidErr } = await supabase
      .schema('public')
      .from('lesson_question_bank')
      .select('question_id')
      .eq('lesson_id', lessonId)

    if (qidErr) return res.status(500).json({ error: qidErr.message })
    if (!qids || qids.length === 0) return res.json({ questions: [] })

    // 4) Fetch questions
    const { data: questions, error: qErr } = await supabase
      .schema('public')
      .from('questions')
      .select('*')
      .in(
        'question_id',
        qids.map(q => q.question_id)
      )

    if (qErr) return res.status(500).json({ error: qErr.message })

    return res.json({
      questions: (questions || []).map(q => ({ ...q, lesson_id: lessonId })),
    })
  } catch (e) {
    console.error('mobile questions route error:', e)
    return res.status(500).json({ error: 'Server error' })
  }
})

// Optional query variant: /mobile/questions?class_id=..&lesson_id=..
app.get('/mobile/questions', verifyUser, async (req, res) => {
  try {
    const supabase = createClient({ req, res })
    const classId = Number(req.query.class_id)
    const lessonId = Number(req.query.lesson_id)
    if (!Number.isFinite(lessonId)) return res.status(400).json({ error: 'lesson_id required' })

    // enrollment check if class_id present
    if (Number.isFinite(classId)) {
      const { data: me } = await supabase.auth.getUser()
      const uid = me?.user?.id

      const { data: enrollment, error: enrollmentErr } = await supabase
        .schema('public')
        .from('enrollments')
        .select('class_id')
        .eq('class_id', classId)
        .eq('student_id', uid)
        .limit(1)
      if (enrollmentErr) return res.status(500).json({ error: enrollmentErr.message })
      if (!enrollment || enrollment.length === 0)
        return res.status(404).json({ error: 'Not enrolled in this class' })
    }

    const { data: qids, error: qidErr } = await supabase
      .schema('public')
      .from('lesson_question_bank')
      .select('question_id')
      .eq('lesson_id', lessonId)
    if (qidErr) return res.status(500).json({ error: qidErr.message })
    if (!qids || qids.length === 0) return res.json({ questions: [] })

    const { data: questions, error: qErr } = await supabase
      .schema('public')
      .from('questions')
      .select('*')
      .in(
        'question_id',
        qids.map(q => q.question_id)
      )

    if (qErr) return res.status(500).json({ error: qErr.message })

    return res.json({
      questions: (questions || []).map(q => ({ ...q, lesson_id: lessonId })),
    })
  } catch (e) {
    console.error('mobile questions query route error:', e)
    return res.status(500).json({ error: 'Server error' })
  }
})

// Fetch the first `limit` example questions for a given class + lesson, strictly scoped
async function getLessonExamples(adminClient, classIdMaybe, lessonKeyMaybe, limit = 3) {
  const examples = []
  const classId = Number(classIdMaybe)
  if (!Number.isFinite(classId)) return examples

  // Resolve lesson_id from numeric id or by name through class_lesson_bank (scoped to class)
  let lessonId = null
  if (lessonKeyMaybe != null) {
    const keyStr = String(lessonKeyMaybe)
    if (/^\d+$/.test(keyStr)) {
      lessonId = Number(keyStr)
      // verify the lesson belongs to the class
      const { data: linkRows, error: linkErr } = await adminClient
        .schema('public')
        .from('class_lesson_bank')
        .select('lesson_id')
        .eq('class_id', classId)
        .eq('lesson_id', lessonId)
        .limit(1)
      if (linkErr || !linkRows || linkRows.length === 0) return examples
    } else {
      const cleanedName = decodeURIComponent(keyStr).replace(/-/g, ' ').trim()
      const { data: link, error: linkErr } = await adminClient
        .schema('public')
        .from('class_lesson_bank')
        .select('lesson_id, lessonDetails:lessons(name)')
        .eq('class_id', classId)
        .ilike('lessonDetails.name', cleanedName)
        .maybeSingle()
      if (linkErr || !link) return examples
      lessonId = link.lesson_id
    }
  }
  if (!Number.isFinite(Number(lessonId))) return examples

  // 1) Get the first N question ids for that lesson, deterministic order
  // Prefer created_at if present. If not, use question_id ASC as a proxy for "first".
  let qids = []
  {
    const { data: idRows, error: qidErr } = await adminClient
      .schema('public')
      .from('lesson_question_bank')
      .select('question_id')
      .eq('lesson_id', Number(lessonId))
      .order('question_id', { ascending: true }) // change to 'created_at' if you have that column
      .limit(limit)

    if (qidErr || !idRows || idRows.length === 0) return examples
    qids = idRows.map(r => r.question_id)
  }

  // 2) Fetch those questions
  const { data: qs, error: qErr } = await adminClient
    .schema('public')
    .from('questions')
    .select('question_type, prompt, snippet, topics, answer_options, answer')
    .in('question_id', qids)

  if (qErr || !qs || qs.length === 0) return examples

  const norm = s => (s == null ? '' : String(s))
  const toHyphen = t => {
    const s = typeof t === 'string' ? t : ''
    return s.toLowerCase() === 'multiple_choice' ? 'multiple-choice' : s
  }

  for (const q of qs) {
    examples.push({
      question_type: toHyphen(q.question_type),
      prompt: norm(q.prompt),
      snippet: q.snippet == null ? null : String(q.snippet),
      topics: Array.isArray(q.topics) ? q.topics.map(String) : [],
      answer_options: Array.isArray(q.answer_options) ? q.answer_options : [],
      answer: q.answer == null ? null : String(q.answer),
    })
  }

  return examples.slice(0, limit) // guard even though we already limited
}

/**
 * LLM endpoint (pure JS)
 * POST /llm/transform-question
 * Body: { provider: 'gemini', question: { question_type, prompt, snippet, topics, answer_options, answer } }
 * Returns: the SAME shape.
 */

app.post('/llm/transform-question', async (req, res) => {
  try {
    const mode = typeof req.body?.mode === 'string' ? req.body.mode : 'transform'
    const topic = req.body && typeof req.body.topic === 'string' ? req.body.topic.trim() : null
    const classIdForExamples = req.body?.class_id
    const lessonForExamples = req.body?.lesson_id ?? req.body?.lesson_key ?? req.body?.lesson_name
    const usedLessonKey = lessonForExamples != null ? String(lessonForExamples) : ''

    if (!process.env.GOOGLE_API_KEY) {
      console.error('[LLM CONFIG ERROR] Missing GOOGLE_API_KEY')
      return res.status(500).json({ error: 'Server not configured for Gemini (missing key)' })
    }

    if (mode === 'generate' && (classIdForExamples == null || lessonForExamples == null)) {
      return res
        .status(400)
        .json({ error: 'class_id and lesson_id|lesson_name are required for generate mode' })
    }

    // Optional: resolve class level from DB if class_id is provided
    let levelNum = 0
    try {
      const classIdMaybe = req.body?.class_id
      if (classIdMaybe != null) {
        const classId = Number(classIdMaybe)
        if (Number.isFinite(classId)) {
          const { data: cls, error: clsErr } = await admin
            .schema('public')
            .from('classes')
            .select('level')
            .eq('class_id', classId)
            .maybeSingle()
          if (!clsErr && cls && typeof cls.level === 'number') {
            levelNum = cls.level
          }
        }
      }
    } catch {}
    const levelText = ['intro', 'foundational', 'intermediate', 'advanced'][levelNum] || 'intro'
    const difficultyHint = [
      `Target difficulty: ${levelText}.`,
      levelNum === 0
        ? 'Use simple vocabulary and short prompts with simple code, questions akin to an introductory computer science class (1000 level classes).'
        : '',
      levelNum === 1
        ? 'Assume basic familiarity with syntax, assume for classes with similar difficulty to an intro data structures or algorithms class (2000 level classes).'
        : '',
      levelNum === 2
        ? 'Require small multi step reasoning with short code, think classes like an intro AI class or 3000 level curriculum.'
        : '',
      levelNum === 3
        ? 'Allow for more complex analysis of code, nothing insanely skilled but enough so a graduate student or advanced computer science student would be challenged (4000+ level classes)'
        : '',
    ]
      .filter(Boolean)
      .join(' ')

    // Pull first three examples strictly from this class + lesson
    let examples = []
    try {
      examples = await getLessonExamples(admin, classIdForExamples, lessonForExamples, 3)
    } catch (e) {
      console.warn('[LLM EXAMPLES DEBUG] getLessonExamples failed:', e?.message || e)
    }

    console.log(
      '[LLM EXAMPLES DEBUG] class_id=%s lesson_key=%s examples_count=%d',
      classIdForExamples,
      usedLessonKey,
      Array.isArray(examples) ? examples.length : 0
    )
    console.log('[LLM EXAMPLES DEBUG] normalizedExamples (final, max3):', examples)

    if (mode === 'generate' && (!examples || examples.length === 0)) {
      return res.status(400).json({ error: 'No examples found for this class + lesson' })
    }

    console.log(
      '[LLM EXAMPLES DEBUG] source= %s, class_id=%s, lesson_key=%s',
      lessonForExamples.length ? 'lesson' : 'body',
      classIdForExamples,
      lessonForExamples
    )

    // Logs to verify the actual examples being sent
    console.log('[LLM EXAMPLES DEBUG] normalizedExamples (final, max3):', examples)

    const { mode: _m, class_id, topic: _t, examples: _ex = [], ...rest } = req.body || {}
    const allowedFromExamples = collectExampleTopics(examples)

    // Strict: examples only. If there are no topics in examples, you must return topics: []
    const allowedList = allowedFromExamples

    const topicsInstruction = allowedList.length
      ? `
You MUST choose topics ONLY from this allowed list and return them verbatim (case-insensitive match, return canonical casing from the list):
${allowedList.map(t => `- ${t}`).join('\n')}
If none apply, return "topics": [] in the JSON.`.trim()
      : `
There are NO allowed topics. You MUST return "topics": [] in the JSON.`.trim()

    const q = req.body && req.body.question
    if (mode === 'transform' && (!q || typeof q !== 'object')) {
      return res.status(400).json({ error: 'question is required in transform mode' })
    }

    const user =
      q && typeof q === 'object'
        ? {
            question_type: String(q.question_type || ''),
            prompt: q.prompt == null ? '' : String(q.prompt),
            snippet: q.snippet == null ? null : String(q.snippet),
            topics: Array.isArray(q.topics) ? q.topics.map(String) : [],
            answer_options: q.answer_options == null ? [] : q.answer_options,
            answer: q.answer == null ? null : String(q.answer),
          }
        : {
            question_type: '',
            prompt: '',
            snippet: null,
            topics: [],
            answer_options: [],
            answer: null,
          }

    const sharedRules = [
      'Return a SINGLE JSON object with the SAME keys: question_type, prompt, snippet, topics, answer_options, answer.',
      'Keep topics aligned to the given topic if provided. If topics is empty and a topic exists, include [topic].',
      'Do not include extra keys. Do not wrap in markdown. Return ONLY JSON.',
    ].join(' ')

    const guidance =
      mode === 'generate'
        ? [
            topic
              ? `Generate ONE new question focused on the topic "${topic}".`
              : 'Generate ONE new question for an introductory CS topic.',
            difficultyHint,
            examples.length
              ? 'Use these examples only as style and difficulty guides. Do not copy the questions themselves, but align the questions to the same topics as the examples.'
              : '',
            'Prefer multiple_choice unless the examples suggest short_answer or rearrange.',
            sharedRules,
          ]
            .filter(Boolean)
            .join(' ')
        : [
            topic ? `If appropriate, align to topic "${topic}".` : '',
            difficultyHint,
            examples.length
              ? 'Use these examples only as style and difficulty guides. Do not copy the questions themselves, but align the questions to the same topics as the examples.'
              : '',
            'Normalize or improve the provided question but keep the same intent.',
            sharedRules,
          ]
            .filter(Boolean)
            .join(' ')

    // GEMINI ONLY
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
    const prompt = [
      'You are a careful assistant for quiz authoring. Output JSON only.',
      `Mode: ${mode}`,
      `Instruction: ${guidance}`,
      topicsInstruction, // enforce examples-only topics
      topic ? `Topic: ${topic}` : '',
      `Input: ${JSON.stringify(user)}`,
      `Examples: ${JSON.stringify(examples)}`,
    ]
      .filter(Boolean)
      .join('\n')

    const result = await model.generateContent(prompt)
    const resp = await result.response
    const text = resp.text() || ''

    // Debug prompt and response
    console.log('[LLM PROMPT DEBUG]\\n', prompt.slice(0, 1200))
    console.log('[LLM RAW PREVIEW]', text.slice(0, 600))

    let llmJson
    try {
      const rawBlock = extractJsonBlock(text)
      llmJson = JSON.parse(rawBlock)
    } catch (err) {
      console.error('[LLM JSON PARSE ERROR]', err?.message, { preview: text.slice(0, 600) })
      return res.status(400).json({ error: 'Model did not return valid JSON' })
    }

    // Post-filter topics to examples-only list, case-insensitive mapping back to canonical
    let filteredTopics = []
    if (Array.isArray(allowedList) && allowedList.length > 0) {
      const lowerAllowed = new Map(allowedList.map(t => [t.toLowerCase(), t]))
      const rawTopics = Array.isArray(llmJson.topics) ? llmJson.topics : []
      filteredTopics = rawTopics
        .map(x => String(x ?? '').trim())
        .filter(Boolean)
        .map(x => lowerAllowed.get(x.toLowerCase()))
        .filter(Boolean)
    } else {
      filteredTopics = [] // strict: no topics allowed if examples had none
    }

    console.log('[LLM TOPICS DEBUG]', {
      allowedList,
      llmTopics: Array.isArray(llmJson.topics) ? llmJson.topics : [],
      filteredTopics,
    })

    // Debug what came back and what we keep
    console.log(
      '[LLM EXAMPLES DEBUG] source=lesson-only class_id=%s lesson_key=%s',
      classIdForExamples,
      usedLessonKey
    )

    const out = {
      question_type:
        typeof llmJson.question_type === 'string' ? llmJson.question_type : 'multiple-choice',
      prompt: typeof llmJson.prompt === 'string' ? llmJson.prompt : '',
      snippet: llmJson.snippet == null || llmJson.snippet === '' ? null : String(llmJson.snippet),

      // Strict: only filtered topics. No fallback to req.body.topic.
      topics: filteredTopics,

      answer_options: Array.isArray(llmJson.answer_options)
        ? llmJson.answer_options.map(o => {
            if (typeof o === 'string') return o
            if (o && typeof o === 'object') {
              const v = o.text ?? o.label ?? o.value ?? o.option ?? o.content ?? o.title ?? o.name
              return typeof v === 'string' ? v : JSON.stringify(o)
            }
            return String(o ?? '')
          })
        : [],
      answer: typeof llmJson.answer === 'string' ? llmJson.answer : null,
    }

    return res.json(out)
  } catch (e) {
    console.error(
      'llm/transform-question error:',
      e?.message || e,
      e?.stack ? '\\n' + e.stack.split('\\n').slice(0, 4).join('\\n') : ''
    )
    return res.status(400).json({ error: e?.message || 'Bad request' })
  }
})

// POST /update-node-progress
app.post('/update-node-progress', async (req, res) => {
  try {
    const {
      student_id,
      class_id,
      topics = [],
      attemptsDelta = 0,
      correctDelta = 0,
    } = req.body || {}

    if (!student_id || !class_id || !Array.isArray(topics) || topics.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' })
    }
    const attDelta = Number(attemptsDelta) || 0
    const corDelta = Number(correctDelta) || 0
    if (attDelta < 0 || corDelta < 0 || corDelta > attDelta) {
      return res.status(400).json({ error: 'Invalid deltas' })
    }

    for (const topic of topics) {
      const nodeLabel = String(topic || '').trim()
      if (!nodeLabel) continue

      // read current row
      const { data: existing, error: readErr } = await admin
        .from('leitner_schedule')
        .select('total_attempts, total_correct, box, streak')
        .eq('student_id', student_id)
        .eq('class_id', class_id)
        .eq('node_label', nodeLabel)
        .maybeSingle()

      if (readErr) {
        console.error('[progress] read failed:', readErr)
        continue
      }

      // starting values
      const prevAttempts = existing?.total_attempts || 0
      const prevCorrect = existing?.total_correct || 0
      let box = existing?.box || 1
      let streak = existing?.streak || 0

      // quiz-level outcome for this topic
      const allCorrectThisQuiz = attDelta > 0 && corDelta === attDelta
      if (allCorrectThisQuiz) {
        streak = streak + 1
        box = Math.min(5, box + 1)
      } else {
        streak = 0
        box = Math.max(1, box - 1)
      }

      const nextAttempts = prevAttempts + attDelta
      const nextCorrect = prevCorrect + corDelta

      const payload = {
        student_id,
        class_id,
        node_label: nodeLabel,
        total_attempts: nextAttempts,
        total_correct: nextCorrect,
        last_quiz_attempts: attDelta,
        last_quiz_correct: corDelta,
        last_reviewed: new Date().toISOString(),
        next_review: allCorrectThisQuiz
          ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          : new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        box,
        streak,
      }

      // upsert on unique (student_id, class_id, node_label)
      await admin
        .from('leitner_schedule')
        .upsert(payload, { onConflict: 'student_id,class_id,node_label' })

      if (upsertErr) {
        console.error('[progress] upsert failed:', upsertErr)
      }
    }

    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('[progress] unexpected error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * TODOs:
 * - /enroll: enroll a student in a class (POST)
 * - /drop-class: drop a class for a student (DELETE)
 *
 * - /students: get all students (GET)
 * - /students/update/:id: update a student (PATCH)
 * - /students/:id/classes/remove: remove a class from a student (DELETE) ...probably not needed
 */

export default app
