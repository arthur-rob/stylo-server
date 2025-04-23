import mongoose, { Schema, Document } from 'mongoose'
import { Plotter, PlotterStatus } from '@/types/plotter'

const PlotterStatusEnum: PlotterStatus[] = [
    'active',
    'busy',
    'offline',
    'error',
]

const PlotterSchema: Schema = new Schema<Plotter>({
    name: { type: String, required: true },
    path: { type: String, required: true },
    status: { type: String, enum: PlotterStatusEnum, default: 'offline' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    baudRate: { type: Number, default: 115200 },
})

export default mongoose.model<Plotter & Document>('Plotter', PlotterSchema)
