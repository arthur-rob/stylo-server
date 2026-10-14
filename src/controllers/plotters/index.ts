import { Request, Response } from 'express'
import * as plotterService from '@/services/plotterService'
import Plotter from '@/models/plotterModel'

export const execute = async (req: Request, res: Response) => {
    const params = req.body
    try {
        const gcode = params.gCode
        const plotterId = params.plotterId
        if (!gcode || gcode.length == 0) throw new Error('No Gcode provided')
        await plotterService.execute(gcode, plotterId)
        res.status(200).json({ status: 'drawing' })
    } catch (error) {
        console.error(error)
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

export const register = async (req: Request, res: Response) => {
    const { name, path, baudRate } = req.body ?? {}
    try {
        const plotter = await plotterService.register(name, path, baudRate)
        res.status(201).json(plotter)
    } catch (error: any) {
        const status = error.message === 'Plotter already exists' ? 409 : 400
        res.status(status).json({ message: error.message })
    }
}

const handleError = (res: Response, error: unknown) => {
    if (error instanceof plotterService.PlotterError) {
        res.status(error.status).json({ message: error.message })
        return
    }
    console.error(error)
    res.status(500).json({ message: 'Erreur serveur' })
}

export const update = async (req: Request, res: Response) => {
    try {
        res.json(await plotterService.update(req.params.id, req.body))
    } catch (error) {
        handleError(res, error)
    }
}

export const remove = async (req: Request, res: Response) => {
    try {
        await plotterService.remove(req.params.id)
        res.status(204).end()
    } catch (error) {
        handleError(res, error)
    }
}
