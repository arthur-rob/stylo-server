const  express = require('express')
const  cors = require('cors')
const  bodyParser = require('body-parser')
const  { SerialPort } = require('serialport')
const  { ReadlineParser } = require('@serialport/parser-readline')

const app = express()
const PORT = process.env.PORT || 3000
const machine = new SerialPort({ path: '/dev/tty.usbserial-1120', baudRate: 115200 }, function (err) {
    if (err) return console.log('Error: ', err.message)
})

let commands = []
let currentCommandIndex = 0

machine.on('error', (err) => {
    console.log('Error: ', err.message)
    machine.close()
})

const parser = machine.pipe(new ReadlineParser({ delimiter: '\r\n' }))

parser.on('data', (data) => {
    if (data != "ok") {
        console.log(data)
        console.log(commands[currentCommandIndex])
    }
    console.log(`${currentCommandIndex} / ${commands.length}`)
    if (currentCommandIndex <= commands.length) { 
        sendNextCommand()
    }
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

let isDrawing = false

app.use(cors())
app.use(bodyParser.json())

app.post('/plotter/draw', async (req, res) => {
    const params = req.body
    if (params && params.data && !isDrawing) {
        const gcode = params.data
        sendGcodeToPlotter(gcode)
        isDrawing = true
        return res.json({ status: 'starting' })
    } else {
        res.statusCode = 400
        return res.json({ status: 'error' })
    }
})

app.get('/', (req, res) => {
    res.send('Hello World!')
})

app.get('/plotter/list', async (req, res) => {

    machine.write('$\n')
    const plotterList = await SerialPort.list()

    res.json(plotterList.map(p => p.path))
})

app.get('/plotter/reset', (req, res) => {
    if (machine) {
        isDrawing = false
        currentCommandIndex = 0
    }
    res.json({ status: 'reset' })
})


function sendGcodeToPlotter (gcode) {
    commands = gcode
    sendNextCommand()
}

app.listen(PORT, () => {
    console.log(`Server is running on: http://localhost:${PORT}`)
});