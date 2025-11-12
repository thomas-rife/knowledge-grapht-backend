import express from 'express'
import { createClient } from '../util/subabase.js'

const router = express.Router()
const supabase = createClient()

// Handles updates when student answers a question
router.post('/update-node-progress', async (req, res) => {
  try {
    const { student_id, class_id, lesson_id, topics, correct } = req.body

    if (!student_id || !topics || !Array.isArray(topics)) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    const now = new Date()
    const next = new Date()
    const intervals = [1, 2, 4, 7, 14] // days

    for (const topic of topics) {
      // Get existing record for this student + node
      const { data: existing, error: selErr } = await supabase
        .from('node_schedule')
        .select('*')
        .eq('student_id', student_id)
        .eq('node_label', topic)
        .maybeSingle()

      if (selErr) console.error('Select error:', selErr)

      let box = 1
      let streak = 0

      if (existing) {
        box = existing.box
        streak = existing.streak
        if (correct) {
          box = Math.min(box + 1, 5)
          streak += 1
        } else {
          box = 1
          streak = 0
        }
      } else if (correct) {
        streak = 1
      }

      next.setDate(now.getDate() + intervals[Math.min(box - 1, intervals.length - 1)])

      const updatePayload = {
        student_id,
        class_id,
        lesson_id,
        node_label: topic,
        box,
        streak,
        last_reviewed: now.toISOString(),
        next_review: next.toISOString(),
        created_at: existing?.created_at || now.toISOString(),
      }

      if (existing) {
        await supabase
          .from('node_schedule')
          .update(updatePayload)
          .eq('student_id', student_id)
          .eq('node_label', topic)
      } else {
        await supabase.from('node_schedule').insert(updatePayload)
      }
    }

    res.json({ success: true })
  } catch (err) {
    console.error('Leitner update failed', err)
    res.status(500).json({ error: 'Leitner update failed' })
  }
})

export default router
