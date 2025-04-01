import { SerialPort } from 'serialport'
import { ReadlineParser } from '@serialport/parser-readline'
import { Request, Response } from 'express'

const machine = new SerialPort({ path: '/dev/tty.usbserial-1120', baudRate: 115200 }, function (err: any) {
    if (err) return console.log('Error: ', err.message)
})
const parser = machine.pipe(new ReadlineParser({ delimiter: '\r\n' }))
let isDrawing = false
let commands: string[] = []
let currentCommandIndex = 0

parser.on('data', (data: string) => {
    if (data != "ok") {
        console.log(data)
        console.log(commands[currentCommandIndex])
    }
    console.log(`${currentCommandIndex} / ${commands.length}`)
    if (currentCommandIndex <= commands.length) { 
        sendNextCommand()
    }
})

machine.on('error', (err: any) => {
    console.log('Error: ', err.message)
    machine.close()
})


const sendNextCommand = () => {
    if (currentCommandIndex < commands.length) {
        machine.write(`${commands[currentCommandIndex]}\n`)
    } else {
        currentCommandIndex = 0
        commands = []
        isDrawing = false
        return
    }
    currentCommandIndex++
}

const sendGcodeToPlotter = (gcode: string[]) => {
    commands = gcode
    sendNextCommand()
}


export const draw = (req: Request, res: Response) => {
    const params = req.body as { data?: string[] }
    if (params?.data && !isDrawing) {
        const gcode = params.data
        sendGcodeToPlotter(gcode)
        isDrawing = true
        res.status(200).json({ status: 'starting' })
    } else {
        res.status(400).json({ status: 'error' })
    }
}

export const list = async (req: Request, res: Response) => {
    machine.write('$\n')
    const plotterList = await SerialPort.list()
    res.json(plotterList.map(p => p.path))
}

export const reset = (req: Request, res: Response) => {
    if (machine) {
        isDrawing = false
        currentCommandIndex = 0
    }
    res.json({ status: 'reset' })
}
