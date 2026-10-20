
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const pool = require('./config/database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
    origin: [
        'https://theo-food.netlify.app',
        'https://theofrontend-bvy1traz4-ruben-4267.vercel.app',
        'http://127.0.0.1:5500',
        'http://localhost:5500'
    ]
}));


app.use(express.json());

// Comprobar el estado del backend
app.get('/api/estado', (req, res) => {
    res.json({
        mensaje: 'Backend de THEO funcionando correctamente'
    });
});

// Probar la conexión con PostgreSQL
app.get('/api/estado-db', async (req, res) => {
    try {
        const resultado = await pool.query('SELECT NOW() AS fecha');

        res.json({
            mensaje: 'Conexión con PostgreSQL exitosa',
            fecha: resultado.rows[0].fecha
        });
    } catch (error) {
        console.error('Error al conectar con PostgreSQL:', error.message);

        res.status(500).json({
            mensaje: 'No se pudo conectar con la base de datos'
        });
    }
});

// Rutas de productos
const rutasProductos = require('./routes/productos');
app.use('/api/productos', rutasProductos);

const rutasPedidos = require('./routes/pedidos');
app.use('/api/pedidos', rutasPedidos);

const rutasAuth = require('./routes/auth');
app.use('/api/auth', rutasAuth);

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor THEO activo en el puerto ${PORT}`);
});
