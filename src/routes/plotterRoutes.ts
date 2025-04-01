import express from "express";
import { draw, list, reset } from "@/controllers/plotters/index";
const router = express.Router();


router.post('/draw', draw)
router.get('/list', list)
router.get('/reset', reset)

export default router