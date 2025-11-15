const express = require('express');
const cors = require('cors');
const mssql = require('mssql');
require('dotenv').config();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Proxy endpoints a Azure APIs
const AUTH_URL = 'https://backcvbgtmdesa.azurewebsites.net/api/login/authenticate';
const MSG_URL = 'https://backcvbgtmdesa.azurewebsites.net/api/Mensajes';

app.post('/api/login', async (req, res) => {
  try {
    const resp = await fetch(AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    res.status(500).json({ Message: err.message });
  }
});

app.post('/api/messages', async (req, res) => {
  try {
    const auth = req.headers['authorization'] || req.headers['Authorization'];
    const resp = await fetch(MSG_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(auth ? { Authorization: auth } : {}),
      },
      body: JSON.stringify(req.body),
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    res.status(500).json({ Message: err.message });
  }
});

// SQL Server connection
const sqlConfig = {
  server: process.env.SQL_SERVER,
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  database: process.env.SQL_DATABASE,
  port: parseInt(process.env.SQL_PORT || '1433', 10),
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
};

app.get('/api/messages', async (req, res) => {
  try {
    const auth = req.headers['authorization'] || req.headers['Authorization'];
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ Message: 'Unauthorized' });
    }
    const pool = await mssql.connect(sqlConfig);

    // Descubre las columnas reales de la tabla para evitar errores por cambios de esquema
    const colsRes = await pool.request().query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'Chat_Mensaje'"
    );
    const cols = (colsRes.recordset || []).map(r => r.COLUMN_NAME);

    // Elige una columna de fecha disponible para ordenar
    const orderCandidates = ['Fec_Creacion', 'Fecha', 'Fecha_Creacion', 'FecCreacion', 'createdAt', 'fecha'];
    const orderCol = orderCandidates.find(c => cols.includes(c));

    // Construye el SELECT de forma segura según lo que existe en la tabla
    const query = orderCol
      ? `SELECT TOP 200 * FROM [dbo].[Chat_Mensaje] ORDER BY [${orderCol}] ASC`
      : `SELECT TOP 200 * FROM [dbo].[Chat_Mensaje]`;

    const result = await pool.request().query(query);
    res.json(result.recordset || []);
  } catch (err) {
    res.status(500).json({ Message: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor iniciado en http://localhost:${PORT}`);
});