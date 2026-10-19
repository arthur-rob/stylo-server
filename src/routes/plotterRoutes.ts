import express from 'express'
import {
    execute,
    stop,
    job,
    list,
    discover,
    register,
    update,
    remove,
} from '@/controllers/plotters/index'
const router = express.Router()

router.post('/execute', execute)
router.post('/stop', stop)
router.get('/job', job)
router.get('/list', list)
router.get('/discover', discover)
router.post('/register', register)
router.patch('/:id', update)
router.delete('/:id', remove)
export default router
