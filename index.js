const express = require('express');
const app = express();

app.use(express.json());

app.get('/api/users', (req, res) => {
  res.status(201).json(['old fucker']);
});
const port = 3000;
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});