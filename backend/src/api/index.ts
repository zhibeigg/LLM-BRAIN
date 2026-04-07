import { Router } from 'express'
import { brainsRouter } from './brains.js'
import { nodesRouter } from './nodes.js'
import { edgesRouter } from './edges.js'
import { personalityRouter } from './personality.js'
import { llmConfigRouter } from './llm-config.js'
import { difficultyMappingRouter } from './difficulty-mapping.js'
import { difficultyRouter } from './difficulty.js'
import { taskRouter } from './task.js'
import { evolutionRouter } from './evolution.js'
import { learnRouter } from './learn.js'
import { chatSessionsRouter } from './chat-sessions.js'

export const apiRouter = Router()

apiRouter.use('/brains', brainsRouter)
apiRouter.use('/nodes', nodesRouter)
apiRouter.use('/edges', edgesRouter)
apiRouter.use('/personality', personalityRouter)
apiRouter.use('/llm', llmConfigRouter)
apiRouter.use('/difficulty-mapping', difficultyMappingRouter)
apiRouter.use('/difficulty', difficultyRouter)
apiRouter.use('/task', taskRouter)
apiRouter.use('/evolution', evolutionRouter)
apiRouter.use('/learn', learnRouter)
apiRouter.use('/chat-sessions', chatSessionsRouter)
