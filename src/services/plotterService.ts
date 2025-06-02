import { SerialPort } from 'serialport'
import { ReadlineParser } from '@serialport/parser-readline'
import Plotter from '@/models/plotterModel'
import { PLOTTER_STATUS } from '@/constants/plotter'
import { PlotterStatus } from '@/types/plotter'

export const draw = async (gcode: string[], plotterName: string) => {
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
