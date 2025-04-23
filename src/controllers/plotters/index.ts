import { Request, Response } from 'express'
import * as plotterService from '@/services/plotterService'
import Plotter from '@/models/plotterModel'

export const draw = async (req: Request, res: Response) => {
    const params = req.body
    try {
        const gcode = params.data?.gcode
        const plotterId = params.data?.plotterId
        if (!gcode) throw new Error('No Gcode provided')
        await plotterService.draw(gcode, plotterId)
        res.status(200).json({ status: 'drawing' })
    } catch (error) {
        res.status(400).json({ status: error })
    }
}

export const list = async (req: Request, res: Response) => {
    try {
        const plotters = await Plotter.find()
        res.json(plotters)
    } catch (error) {
        res.status(500).json({ message: 'Erreur serveur' })
    }
}

export const discover = async (req: Request, res: Response) => {
    try {
        res.json(await plotterService.discover())
    } catch (error) {
        res.status(500).json({ message: 'Erreur serveur' })
    }
}
