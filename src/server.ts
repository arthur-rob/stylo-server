import 'tsconfig-paths/register'
import app from '@/app'
const PORT = process.env.PORT || 3000

app.listen(PORT, (error) => {
    console.log(`Server is running on: http://localhost:${PORT}`)
    if (error) {
        console.log(error)
    }
})
