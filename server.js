// server.js
import app from './src/index.js'
import serverless from 'serverless-http'

export const maxDuration = 60
export default serverless(app)
