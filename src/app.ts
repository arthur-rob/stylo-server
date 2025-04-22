
import express, { Application } from 'express'
import cors from 'cors'
import bodyParser from 'body-parser'
import plotterRoutes from '@/routes/plotterRoutes'
import mongoose from "mongoose";

const app: Application = express()

app.use(cors())
app.use(bodyParser.json())

mongoose
    .connect(process.env.MONGO_URI as string)
    .then(() => console.log("MongoDB connected"))
    .catch((err) => console.log(err));

app.use('/plotter', plotterRoutes)
app.get('/', (req, res) => {
    res.send('Hello Plotter !')
})

export default app
