import Plotter from '@/models/plotterModel'
import * as plotterService from '@/services/plotterService'
import { PLOTTER_STATUS } from '@/constants/plotter'
import { SerialPort } from 'serialport'

jest.mock('serialport')
jest.mock('@serialport/parser-readline')
jest.mock('@/models/plotterModel')

describe('plotterService', () => {
    afterEach(() => {
        jest.clearAllMocks()
    })

    describe('draw', () => {
        it('should execute GCode commands and update plotter status', async () => {
            const mockPlotter = {
                _id: '123',
                path: '/dev/ttyUSB0',
                baudRate: 115200,
                status: 'idle',
                save: jest.fn(),
            }

            ;(Plotter.findById as jest.Mock).mockResolvedValue(mockPlotter)
            jest.spyOn(
                plotterService,
                'executeGCodeCommands'
            ).mockImplementation(jest.fn())

            const gcode = ['G0 X10 Y10', 'G1 X20 Y20']
            await plotterService.draw(gcode, '123')

            expect(Plotter.findById).toHaveBeenCalledWith('123')
            expect(mockPlotter.save).toHaveBeenCalledTimes(1)
            expect(mockPlotter.status).toBe(PLOTTER_STATUS.BUSY)
            expect(plotterService.executeGCodeCommands).toHaveBeenCalledWith(
                ['G0 X10 Y10', 'G1 X20 Y20'],
                {},
                undefined
            )
        })

        it('should throw an error if plotter is not found', async () => {
            ;(Plotter.findById as jest.Mock).mockResolvedValue(null)

            await expect(plotterService.draw([], '123')).rejects.toThrow(
                'Plotter not found'
            )
        })
    })

    describe('discover', () => {
        it('should return a list of available serial ports', async () => {
            const mockPorts = [
                { path: '/dev/ttyUSB0' },
                { path: '/dev/ttyUSB1' },
            ]
            ;(SerialPort.list as jest.Mock).mockResolvedValue(mockPorts)

            const ports = await plotterService.discover()

            expect(SerialPort.list).toHaveBeenCalledTimes(1)
            expect(ports).toEqual(mockPorts)
        })
    })
})
