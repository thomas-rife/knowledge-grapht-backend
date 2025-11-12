import express from 'express'
// import { admin } from '../util/subabase.js'

const router = express.Router()

router.post('/update-node-progress', async (req, res) => {
  try {
    const { student_id, class_id, topics = [], correct } = req.body

    if (!student_id || !class_id || !Array.isArray(topics) || topics.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    for (const topic of topics) {
      // 1. Update or insert Leitner schedule entry
      const { error: scheduleError } = await admin.from('node_schedule').upsert(
        {
          student_id,
          class_id,
          node_label: topic,
          last_reviewed: new Date().toISOString(),
          next_review: correct
            ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // +1 day if correct
            : new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // +2 hours if incorrect
          box: correct ? 2 : 1,
          streak: correct ? 1 : 0,
        },
        { onConflict: 'student_id,node_label' }
      )

      if (scheduleError) {
        console.error('Error updating Leitner schedule:', scheduleError)
      }

      // 2. Fetch the class graph
      const { data: graphData, error: fetchError } = await admin
        .from('class_knowledge_graph')
        .select('react_flow_data')
        .eq('class_id', class_id)
        .maybeSingle()

      if (fetchError || !graphData) {
        console.error('Error fetching graph data:', fetchError)
        continue
      }

      // 3. Update node data within the react_flow_data JSON
      const rf = graphData.react_flow_data?.[0]
      if (!rf?.reactFlowNodes) continue

      const updatedNodes = rf.reactFlowNodes.map(node => {
        if (node.data?.label === topic) {
          const newCorrect = (node.data.correctResponses ?? 0) + (correct ? 1 : 0)
          const newOccur = (node.data.occurrences ?? 0) + 1
          return {
            ...node,
            data: { ...node.data, correctResponses: newCorrect, occurrences: newOccur },
          }
        }
        return node
      })

      // 4. Push the updated graph data back to Supabase
      const { error: updateError } = await admin
        .from('class_knowledge_graph')
        .update({ react_flow_data: [{ ...rf, reactFlowNodes: updatedNodes }] })
        .eq('class_id', class_id)

      if (updateError) {
        console.error('Error updating node progress in graph:', updateError)
      }
    }

    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('Unexpected error updating node progress:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
