
import express, { Application } from 'express'
import cors from 'cors'
import bodyParser from 'body-parser'
import plotterRoutes from '@/routes/plotterRoutes'

const app: Application = express()

app.use(cors())
app.use(bodyParser.json())
app.use('/plotter', plotterRoutes)
app.get('/', (req, res) => {
    res.send('Hello Plotter !')
})

export default app
