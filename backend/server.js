const express = require('express');
const cors = require('cors');
const app = express();

// 1. Enable CORS to allow frontend to call this server
app.use(cors());
app.use(express.json());

const PORT = 5050; 

// Define the /ask route
// app.get('/ask', (req, res) => {
//     // 3. Return mock JSON
//     res.json({
//         response: "This is a mock response from the Orchestrator.",
//         status: "success",
//         timestamp: new Date().toISOString()
//     });
// });

app.post('/ask', async (req, res) => {
  try {
    const prompt = req.body.prompt;

    const response = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "phi",
        messages: [{ role: "user", content: prompt }],
        stream: false
      })
    });

    const data = await response.json();

    res.json({
      response: data.message.content,
      status: "success"
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ status: "error", message: "LLM call failed" });
  }
});


// Start the server
app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
});