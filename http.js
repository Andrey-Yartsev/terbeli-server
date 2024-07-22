const express = require('express');
const app = express();
app.get('/', function (req, res) {
  res.send('Hello World')
});
console.log('listen 80')
app.listen(80)