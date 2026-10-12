import express from 'express'
import {
    execute,
    list,
    discover,
    register,
    update,
    remove,
} from '@/controllers/plotters/index'
const router = express.Router()

router.post('/execute', execute)
router.get('/list', list)
router.get('/discover', discover)
router.post('/register', register)
router.patch('/:id', update)
router.delete('/:id', remove)
export default router
