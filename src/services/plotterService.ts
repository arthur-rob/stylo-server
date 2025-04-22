import { SerialPort } from 'serialport'
import { ReadlineParser } from '@serialport/parser-readline'
import Plotter from '@/models/plotterModel'

const machine = new SerialPort({ path: '/dev/tty.usbserial-1120', baudRate: 115200 }, function (err: any) {
    if (err) return console.log('Error: ', err.message)
})
const parser = machine.pipe(new ReadlineParser({ delimiter: '\r\n' }))
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
        
        return
    }
    currentCommandIndex++
}

const sendGcodeToPlotter = (gcode: string[]) => {
    commands = gcode
    sendNextCommand()
}

export const draw = async (gcode: string[], plotterId: string) => {
    const plotter = await Plotter.findById(plotterId)
    if (!plotter) throw new Error("Plotter not found");
    plotter.status = "busy"
    sendGcodeToPlotter(gcode)  
    await plotter.save()
    return plotter
}

export const discover = async () => {
    return await SerialPort.list()
}

export const reset = async () => { 
    if (machine.isOpen) {
        machine.close()
    }
    machine.open()
    machine.write("G28\n")
    machine.write("G90\n")
    machine.write("G92 X0 Y0 Z0\n")
    machine.write("G1 X0 Y0 Z0 F3000\n")
}