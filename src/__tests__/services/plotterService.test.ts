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

    describe('execute', () => {
        it('should execute GCode commands and update plotter status', async () => {
            const mockPlotter = {
                _id: '123',
                path: '/dev/ttyUSB0',
                baudRate: 115200,
                status: 'idle',
                save: jest.fn(),
            }

            ;(Plotter.findOne as jest.Mock).mockResolvedValue(mockPlotter)
            jest.spyOn(
                plotterService,
                'executeGCodeCommands'
            ).mockImplementation(jest.fn())

            const gcode = ['G0 X10 Y10', 'G1 X20 Y20']
            await plotterService.execute(gcode, '123')

            expect(Plotter.findOne).toHaveBeenCalledWith({ name: '123' })
            expect(mockPlotter.save).toHaveBeenCalledTimes(1)
            expect(mockPlotter.status).toBe(PLOTTER_STATUS.BUSY)
            expect(plotterService.executeGCodeCommands).toHaveBeenCalledWith(
                ['G0 X10 Y10', 'G1 X20 Y20'],
                {},
                undefined
            )
        })

        it('should throw an error if plotter is not found', async () => {
            ;(Plotter.findOne as jest.Mock).mockResolvedValue(null)

            await expect(plotterService.execute([], '123')).rejects.toThrow(
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

    describe('register', () => {
        it('should create a plotter when the name is free', async () => {
            const created = {
                _id: '123',
                name: 'plotter-1',
                path: '/dev/ttyUSB0',
                baudRate: 115200,
            }
            ;(Plotter.findOne as jest.Mock).mockResolvedValue(null)
            ;(Plotter.create as jest.Mock).mockResolvedValue(created)

            const plotter = await plotterService.register(
                'plotter-1',
                '/dev/ttyUSB0',
                115200
            )

            expect(Plotter.findOne).toHaveBeenCalledWith({ name: 'plotter-1' })
            expect(Plotter.create).toHaveBeenCalledWith({
                name: 'plotter-1',
                path: '/dev/ttyUSB0',
                baudRate: 115200,
            })
            expect(plotter).toEqual(created)
        })

        it('should throw an error if the name is already taken', async () => {
            ;(Plotter.findOne as jest.Mock).mockResolvedValue({ _id: '123' })

            await expect(
                plotterService.register('plotter-1', '/dev/ttyUSB0')
            ).rejects.toThrow('Plotter already exists')
            expect(Plotter.create).not.toHaveBeenCalled()
        })

        it('should throw an error if name or path is missing', async () => {
            await expect(
                plotterService.register('', '/dev/ttyUSB0')
            ).rejects.toThrow('No name provided')
            await expect(
                plotterService.register('plotter-1', '')
            ).rejects.toThrow('No path provided')
            expect(Plotter.create).not.toHaveBeenCalled()
        })

        it('should throw an error if baudRate is invalid', async () => {
            await expect(
                plotterService.register('plotter-1', '/dev/ttyUSB0', -1)
            ).rejects.toThrow('Invalid baudRate')
        })
    })

    describe('update', () => {
        const id = '507f1f77bcf86cd799439011'

        it('should update editable fields only', async () => {
            const updated = { _id: id, name: 'stylo02' }
            ;(Plotter.findOne as jest.Mock).mockResolvedValue(null)
            ;(Plotter.findByIdAndUpdate as jest.Mock).mockResolvedValue(updated)

            const plotter = await plotterService.update(id, {
                name: ' stylo02 ',
                baudRate: 9600,
                status: 'busy',
            } as never)

            expect(Plotter.findByIdAndUpdate).toHaveBeenCalledWith(
                id,
                expect.objectContaining({ name: 'stylo02', baudRate: 9600 }),
                expect.anything()
            )
            const changes = (Plotter.findByIdAndUpdate as jest.Mock).mock
                .calls[0][1]
            expect(changes.status).toBeUndefined()
            expect(changes.updatedAt).toBeInstanceOf(Date)
            expect(plotter).toEqual(updated)
        })

        it('should keep its own name without conflict', async () => {
            ;(Plotter.findOne as jest.Mock).mockResolvedValue({ _id: id })
            ;(Plotter.findByIdAndUpdate as jest.Mock).mockResolvedValue({
                _id: id,
            })

            await expect(
                plotterService.update(id, { name: 'stylo01' })
            ).resolves.toEqual({ _id: id })
        })

        it('should reject a name used by another plotter', async () => {
            ;(Plotter.findOne as jest.Mock).mockResolvedValue({ _id: 'other' })

            await expect(
                plotterService.update(id, { name: 'stylo01' })
            ).rejects.toMatchObject({ status: 409 })
            expect(Plotter.findByIdAndUpdate).not.toHaveBeenCalled()
        })

        it('should reject an empty path or invalid baud rate', async () => {
            await expect(
                plotterService.update(id, { path: '  ' })
            ).rejects.toThrow('Serial port is required')
            await expect(
                plotterService.update(id, { baudRate: 0 })
            ).rejects.toThrow('Baud rate must be a positive integer')
        })

        it('should return 404 for unknown or malformed ids', async () => {
            ;(Plotter.findByIdAndUpdate as jest.Mock).mockResolvedValue(null)

            await expect(
                plotterService.update(id, { baudRate: 9600 })
            ).rejects.toMatchObject({ status: 404 })
            await expect(
                plotterService.update('not-an-id', {})
            ).rejects.toMatchObject({ status: 404 })
        })
    })

    describe('remove', () => {
        it('should delete the plotter', async () => {
            const id = '507f1f77bcf86cd799439011'
            ;(Plotter.findByIdAndDelete as jest.Mock).mockResolvedValue({
                _id: id,
            })

            await plotterService.remove(id)

            expect(Plotter.findByIdAndDelete).toHaveBeenCalledWith(id)
        })

        it('should return 404 when the plotter does not exist', async () => {
            ;(Plotter.findByIdAndDelete as jest.Mock).mockResolvedValue(null)

            await expect(
                plotterService.remove('507f1f77bcf86cd799439011')
            ).rejects.toMatchObject({ status: 404 })
        })
    })
})
