const path = require('node:path');

const PORT = Number(process.env.PORT) || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'app.sqlite');
const NODE_ENV = process.env.NODE_ENV || 'development';

module.exports = {
  PORT,
  DB_PATH,
  NODE_ENV,
};
