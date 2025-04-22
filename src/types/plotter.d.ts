export interface Plotter {
    id: string
    name: string
    path: string
    baudRate: number
    status: PlotterStatus
    createdAt?: Date
    updatedAt?: Date
}

export type PlotterStatus = 'active' | 'busy' | 'offline' | 'error'
