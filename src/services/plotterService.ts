import { SerialPort } from 'serialport'
import { ReadlineParser } from '@serialport/parser-readline'
import Plotter from '@/models/plotterModel'

export const draw = async (gcode: string[], plotterId: string) => {
    const plotter = await Plotter.findById(plotterId)
    if (!plotter) throw new Error('Plotter not found')
    plotter.status = 'busy'
    await plotter.save()

    let serialPort = new SerialPort(
        { path: plotter.path, baudRate: plotter.baudRate },
        function (err: any) {
            if (err) return console.log('Error: ', err.message)
        }
    )
    const parser = serialPort.pipe(new ReadlineParser({ delimiter: '\r\n' }))

    let commands: string[] = gcode
    let currentCommandIndex = 0

    parser.on('data', (data: string) => {
        if (data != 'ok') {
            console.log(data)
            console.log(commands[currentCommandIndex])
        }
        console.log(`${currentCommandIndex} / ${commands.length}`)
        if (currentCommandIndex <= commands.length) {
            serialPort.write(`${commands[currentCommandIndex]}\n`)
            currentCommandIndex++
        }
    })

    serialPort.on('error', (err: any) => {
        console.log('Error: ', err.message)
        serialPort.close()
    })

    serialPort.write(`${commands[currentCommandIndex]}\n`)

    return plotter
}

export const discover = async () => {
    return await SerialPort.list()
}

export const reset = async () => {}
