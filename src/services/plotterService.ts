import mongoose from 'mongoose'
import { SerialPort } from 'serialport'
import { ReadlineParser } from '@serialport/parser-readline'
import Plotter from '@/models/plotterModel'
import { PLOTTER_STATUS } from '@/constants/plotter'
import { Plotter as PlotterType, PlotterStatus } from '@/types/plotter'

// Plots being streamed, by plotter name: one serial connection per plotter
interface Job {
    commands: string[]
    sent: number
    total: number
    stopping: boolean
    // commands of the drawing sent before it was stopped
    sentBeforeStop: number
    finish: (status: PlotterStatus) => void
}
const jobs = new Map<string, Job>()
// plotters whose serial port is being opened, not streaming yet
const starting = new Set<string>()

export const getJob = (plotterName: string) => {
    const job = jobs.get(plotterName)
    return job
        ? {
              running: true,
              stopping: job.stopping,
              sent: job.stopping
                  ? job.sentBeforeStop
                  : Math.min(job.sent, job.total),
              total: job.total,
          }
        : { running: false, stopping: false, sent: 0, total: 0 }
}

export const execute = async (gcode: string[], plotterName: string) => {
    if (jobs.has(plotterName) || starting.has(plotterName))
        throw new PlotterError('The plotter is already plotting', 409)
    starting.add(plotterName)
    try {
        const plotter = await getPlotterByName(plotterName)
        const serialPort = await openSerialPort(plotter)
        const parser = setupParser(serialPort)

        await updatePlotterStatus(plotterName, PLOTTER_STATUS.BUSY)
        await executeGCodeCommands(gcode, serialPort, parser, plotterName)

        return plotter
    } finally {
        starting.delete(plotterName)
    }
}

// Stop streaming the current plot, then send finalCommands (e.g. lift the pen)
export const stop = (plotterName: string, finalCommands: string[] = []) => {
    const job = jobs.get(plotterName)
    if (!job) return { stopped: false }
    if (!job.stopping) {
        job.stopping = true
        job.sentBeforeStop = job.sent
        job.commands = finalCommands
        job.sent = 0
        // the firmware may never answer again: don't keep the port forever
        setTimeout(() => job.finish(PLOTTER_STATUS.IDLE), STOP_TIMEOUT).unref()
    }
    return { stopped: true }
}

const STOP_TIMEOUT = 10000

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

// Open the port before streaming so a wrong path or a busy port is reported
const openSerialPort = (plotter: any): Promise<SerialPort> => {
    const serialPort = new SerialPort({
        path: plotter.path,
        baudRate: plotter.baudRate,
        autoOpen: false,
    })
    return new Promise((resolve, reject) =>
        serialPort.open((err) =>
            err
                ? reject(
                      new PlotterError(
                          `Could not open ${plotter.path}: ${err.message}`,
                          503
                      )
                  )
                : resolve(serialPort)
        )
    )
}

const setupParser = (serialPort: SerialPort) => {
    return serialPort.pipe(new ReadlineParser({ delimiter: '\r\n' }))
}

export const executeGCodeCommands = async (
    gcode: string[],
    serialPort: SerialPort,
    parser: ReadlineParser,
    plotterName: string
) => {
    let finished = false
    const job: Job = {
        commands: gcode,
        sent: 0,
        total: gcode.length,
        stopping: false,
        sentBeforeStop: 0,
        finish: (status) => {
            if (finished) return
            finished = true
            jobs.delete(plotterName)
            try {
                if (serialPort.isOpen) serialPort.close()
            } catch (error: any) {
                console.error('Error closing port: ', error.message)
            }
            updatePlotterStatus(plotterName, status).catch((error) =>
                console.error('Could not update plotter status', error)
            )
        },
    }
    jobs.set(plotterName, job)

    // the firmware answers each command: send the next one on every answer
    const sendNext = () => {
        if (job.sent >= job.commands.length) {
            job.finish(PLOTTER_STATUS.IDLE)
            return
        }
        serialPort.write(`${job.commands[job.sent]}\n`)
        job.sent++
    }
    parser.on('data', () => {
        console.log(`${plotterName}: ${job.sent} / ${job.commands.length}`)
        sendNext()
    })

    serialPort.on('error', (err: any) => {
        console.error('Serial Error: ', err.message)
        job.finish(PLOTTER_STATUS.ERROR)
    })
    serialPort.on('close', () => job.finish(PLOTTER_STATUS.IDLE))

    if (job.commands.length > 0) sendNext()
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
    if (input.name !== undefined) data.name = requiredString(input.name, 'Name')
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
