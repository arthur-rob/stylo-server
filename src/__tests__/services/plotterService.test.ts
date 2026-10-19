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
        jest.restoreAllMocks()
    })

    describe('execute', () => {
        const mockSerialPort = (openError: Error | null = null) => {
            const port = {
                open: jest.fn((cb: (err: Error | null) => void) =>
                    cb(openError)
                ),
                pipe: jest.fn(),
            }
            ;(SerialPort as unknown as jest.Mock).mockImplementation(() => port)
            return port
        }

        it('should execute GCode commands and update plotter status', async () => {
            const mockPlotter = {
                _id: '123',
                path: '/dev/ttyUSB0',
                baudRate: 115200,
                status: 'idle',
                save: jest.fn(),
            }
            const port = mockSerialPort()

            ;(Plotter.findOne as jest.Mock).mockResolvedValue(mockPlotter)
            jest.spyOn(
                plotterService,
                'executeGCodeCommands'
            ).mockImplementation(jest.fn())

            const gcode = ['G0 X10 Y10', 'G1 X20 Y20']
            await plotterService.execute(gcode, '123')

            expect(Plotter.findOne).toHaveBeenCalledWith({ name: '123' })
            expect(SerialPort).toHaveBeenCalledWith({
                path: '/dev/ttyUSB0',
                baudRate: 115200,
                autoOpen: false,
            })
            expect(mockPlotter.save).toHaveBeenCalledTimes(1)
            expect(mockPlotter.status).toBe(PLOTTER_STATUS.BUSY)
            expect(plotterService.executeGCodeCommands).toHaveBeenCalledWith(
                ['G0 X10 Y10', 'G1 X20 Y20'],
                port,
                undefined,
                '123'
            )
        })

        it('should throw an error if plotter is not found', async () => {
            ;(Plotter.findOne as jest.Mock).mockResolvedValue(null)

            await expect(plotterService.execute([], '123')).rejects.toThrow(
                'Plotter not found'
            )
        })

        it('should report a serial port that cannot be opened', async () => {
            ;(Plotter.findOne as jest.Mock).mockResolvedValue({
                path: '/dev/missing',
                save: jest.fn(),
            })
            mockSerialPort(new Error('No such file or directory'))

            await expect(
                plotterService.execute(['G0 X1'], 'unplugged')
            ).rejects.toMatchObject({
                status: 503,
                message:
                    'Could not open /dev/missing: No such file or directory',
            })
            expect(plotterService.getJob('unplugged').running).toBe(false)
        })
    })

    describe('streaming and stop', () => {
        const { EventEmitter } = jest.requireActual('events')

        const fakeConnection = () => {
            const port = Object.assign(new EventEmitter(), {
                isOpen: true,
                write: jest.fn(),
                close: jest.fn(),
            })
            const parser = new EventEmitter()
            return { port, parser }
        }

        beforeEach(() => {
            ;(Plotter.findOne as jest.Mock).mockResolvedValue({
                save: jest.fn(),
            })
        })

        it('should send one command per answer and finish', async () => {
            const { port, parser } = fakeConnection()
            await plotterService.executeGCodeCommands(
                ['A', 'B'],
                port as never,
                parser as never,
                'p1'
            )
            expect(port.write).toHaveBeenLastCalledWith('A\n')
            expect(plotterService.getJob('p1')).toEqual({
                running: true,
                stopping: false,
                sent: 1,
                total: 2,
            })

            parser.emit('data', 'ok')
            expect(port.write).toHaveBeenLastCalledWith('B\n')
            parser.emit('data', 'ok')

            expect(port.close).toHaveBeenCalled()
            expect(plotterService.getJob('p1').running).toBe(false)
        })

        it('should stop streaming and send the final commands', async () => {
            const { port, parser } = fakeConnection()
            await plotterService.executeGCodeCommands(
                ['A', 'B', 'C'],
                port as never,
                parser as never,
                'p2'
            )

            expect(plotterService.stop('p2', ['PEN UP'])).toEqual({
                stopped: true,
            })
            expect(plotterService.getJob('p2')).toMatchObject({
                stopping: true,
                sent: 1,
                total: 3,
            })

            parser.emit('data', 'ok')
            expect(port.write).toHaveBeenLastCalledWith('PEN UP\n')
            expect(port.write).not.toHaveBeenCalledWith('B\n')
            parser.emit('data', 'ok')

            expect(port.close).toHaveBeenCalled()
            expect(plotterService.getJob('p2').running).toBe(false)
        })

        it('should refuse a new plot while one is running', async () => {
            const { port, parser } = fakeConnection()
            await plotterService.executeGCodeCommands(
                ['A', 'B'],
                port as never,
                parser as never,
                'p3'
            )

            await expect(
                plotterService.execute(['X'], 'p3')
            ).rejects.toMatchObject({ status: 409 })

            port.emit('error', new Error('unplugged'))
            expect(plotterService.getJob('p3').running).toBe(false)
        })

        it('should report nothing to stop when idle', () => {
            expect(plotterService.stop('idle-plotter')).toEqual({
                stopped: false,
            })
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
