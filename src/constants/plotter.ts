import { PlotterStatus } from "@/types/plotter";

export const PLOTTER_STATUS: Record<string, PlotterStatus> = {
    IDLE: 'idle',
    BUSY: 'busy',
    PAUSED: 'offline',
    ERROR: 'error',
}