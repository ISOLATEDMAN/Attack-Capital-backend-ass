const express = require("express");
const cors = require('cors');
require('dotenv').config();
const authRouter = require('./routes/auth');
const patientRouter = require('./routes/patients');
const sessionRouter = require('./routes/sessions');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;


app.use('/v1', authRouter);
app.use('/v1',patientRouter);
app.use('/v1', sessionRouter);

app.get("/",(req,res)=>{
    res.send("server running");
})


app.listen(PORT, () => {
    if (!process.env.JWT_SECRET) {
        console.warn('Warning: JWT_SECRET is not set. Using fallback secret is insecure for production.');
    }
    console.log(`Server started at port ${PORT}`);
});


app.use((req, res, next) => {
    res.status(404).json({ error: 'Not Found' });
});

app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
});





