import express from 'express'
import { execute, list, discover } from '@/controllers/plotters/index'
const router = express.Router()

router.post('/execute', execute)
router.get('/list', list)
router.get('/discover', discover)
export default router
