import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import axios from 'axios';
import FormData from 'form-data';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;
const ML_API_URL = process.env.ML_API_URL || 'http://127.0.0.1:5000/api/predict';

app.use(cors());
app.use(express.json());

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 },// Limit file size to 25MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type: Only sonar images are allowed.'), false);
        }
    }
})

app.get('/api/health',(req, res) => {
    res.json({
        status: 'online',
        message: 'TARANG Backend is running smoothly',
        timestamp: new Date().toISOString()
    });
});

app.post('/api/scans/analyze', upload.single('scan'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded. Please upload a sonar scan image.' });
        }

        console.log(`📡 Received sonar scan: ${req.file.originalname} (${(req.file.size / 1024).toFixed(1)} KB)`);
        
        const formData = new FormData();
        formData.append('scan', req.file.buffer, {
            filename: req.file.originalname,
            contentType: req.file.mimetype,
        });

        const pythonResponse = await axios.post(ML_API_URL, formData, {
            headers: {
                ...formData.getHeaders(),
            },
            timeout: 30000 // 30 seconds timeout
        });

        return res.json({
            success: true,
            filename: req.file.originalname,
            results: pythonResponse.data,
        });

    } catch (error) {
        console.error('❌ Error analyzing scan:', error.message);

        if (error.code === 'ECONNABORTED') {
            return res.status(503).json({
                error: 'The ML API did not respond in time. Please try again later.'
            });
        }

        return res.status(500).json({
            error: error.response?.data?.error || 'An unexpected error occurred while processing the scan.'
        });
    }
});
    

app.listen(PORT, () => {
    console.log(`🌊TARANG Backend server running at http://localhost:${PORT}`);
});

