import mongoose from 'mongoose'
import { SerialPort } from 'serialport'
import { ReadlineParser } from '@serialport/parser-readline'
import Plotter from '@/models/plotterModel'
import { PLOTTER_STATUS } from '@/constants/plotter'
import { Plotter as PlotterType, PlotterStatus } from '@/types/plotter'

export const execute = async (gcode: string[], plotterName: string) => {
    const plotter = await getPlotterByName(plotterName)
    const serialPort = initializeSerialPort(plotter)
    const parser = setupParser(serialPort)

    await updatePlotterStatus(plotterName, PLOTTER_STATUS.BUSY)
    await executeGCodeCommands(gcode, serialPort, parser)

    return plotter
}

const getPlotterByName = async (plotterName: string) => {
    const plotter = await Plotter.findOne({ name: plotterName })
    if (!plotter) throw new Error('Plotter not found')
    return plotter
}

const updatePlotterStatus = async (
    plotterName: string,
    status: PlotterStatus
) => {
    const plotter = await getPlotterByName(plotterName)
    plotter.status = status
    await plotter.save()
    return plotter
}

const initializeSerialPort = (plotter: any) => {
    return new SerialPort(
        { path: plotter.path, baudRate: plotter.baudRate },
        (err: any) => {
            if (err) console.log('Error: ', err.message)
        }
    )
}

const setupParser = (serialPort: SerialPort) => {
    return serialPort.pipe(new ReadlineParser({ delimiter: '\r\n' }))
}

export const executeGCodeCommands = async (
    gcode: string[],
    serialPort: SerialPort,
    parser: ReadlineParser
) => {
    let commands = gcode
    let currentCommandIndex = 0
    console.log('gcode')
    parser.on('data', () => {
        console.log(`${currentCommandIndex} / ${commands.length}`)
        if (currentCommandIndex == commands.length) {
            serialPort.close()
            return
        }
        if (currentCommandIndex < commands.length) {
            serialPort.write(`${commands[currentCommandIndex]}\n`)
            currentCommandIndex++
        }
    })

    serialPort.on('error', (err: any) => {
        console.error('Serial Error: ', err.message)
        try {
            serialPort.close()
        } catch (error: any) {
            console.error('Error closing port: ', error.message)
        }
    })

    if (commands.length > 0) {
        serialPort.write(`${commands[currentCommandIndex]}\n`)
    }
}

export const discover = async () => {
    return await SerialPort.list()
}

export const register = async (
    name: string,
    path: string,
    baudRate?: number
) => {
    if (!name || typeof name !== 'string') throw new Error('No name provided')
    if (!path || typeof path !== 'string') throw new Error('No path provided')
    if (
        baudRate !== undefined &&
        (!Number.isInteger(baudRate) || baudRate <= 0)
    )
        throw new Error('Invalid baudRate')

    const existing = await Plotter.findOne({ name })
    if (existing) throw new Error('Plotter already exists')

    return await Plotter.create({ name, path, baudRate })
}

export class PlotterError extends Error {
    constructor(
        message: string,
        public status = 400
    ) {
        super(message)
    }
}

type PlotterInput = Partial<Pick<PlotterType, 'name' | 'path' | 'baudRate'>>

const requiredString = (value: unknown, label: string) => {
    const text = typeof value === 'string' ? value.trim() : ''
    if (!text) throw new PlotterError(`${label} is required`)
    return text
}

// Keep only editable fields: absent ones are left untouched
const validatePlotterUpdate = (input: PlotterInput = {}) => {
    const data: PlotterInput = {}
    if (input.name !== undefined)
        data.name = requiredString(input.name, 'Name')
    if (input.path !== undefined)
        data.path = requiredString(input.path, 'Serial port')
    if (input.baudRate !== undefined) {
        const baudRate = Number(input.baudRate)
        if (!Number.isInteger(baudRate) || baudRate <= 0)
            throw new PlotterError('Baud rate must be a positive integer')
        data.baudRate = baudRate
    }
    return data
}

// Plotters are addressed by name when executing G-code, so names must stay unique
const assertNameAvailable = async (name: string, excludeId?: string) => {
    const existing = await Plotter.findOne({ name })
    if (existing && String(existing._id) !== excludeId)
        throw new PlotterError(`A plotter named "${name}" already exists`, 409)
}

const assertValidId = (id: string) => {
    if (!mongoose.isValidObjectId(id))
        throw new PlotterError('Plotter not found', 404)
}

export const update = async (id: string, input: PlotterInput) => {
    assertValidId(id)
    const data = validatePlotterUpdate(input)
    if (data.name) await assertNameAvailable(data.name, id)
    const plotter = await Plotter.findByIdAndUpdate(
        id,
        { ...data, updatedAt: new Date() },
        { new: true, runValidators: true }
    )
    if (!plotter) throw new PlotterError('Plotter not found', 404)
    return plotter
}

export const remove = async (id: string) => {
    assertValidId(id)
    const plotter = await Plotter.findByIdAndDelete(id)
    if (!plotter) throw new PlotterError('Plotter not found', 404)
    return plotter
}
