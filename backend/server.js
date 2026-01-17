const express = require('express');
const cors = require('cors');
const app = express();

// 1. Enable CORS to allow frontend to call this server
app.use(cors());
app.use(express.json());

const PORT = 5000; 

// Define the /ask route
app.get('/ask', (req, res) => {
    // 3. Return mock JSON
    res.json({
        response: "This is a mock response from the Orchestrator.",
        status: "success",
        timestamp: new Date().toISOString()
    });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
});