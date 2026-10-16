
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const router = express.Router();

router.post('/login', async (req, res) => {
    const { usuario, password } = req.body;

    if (
        typeof usuario !== 'string' ||
        typeof password !== 'string' ||
        !usuario.trim() ||
        !password ||
        usuario.length > 50 ||
        password.length > 200
    ) {
        return res.status(400).json({
            mensaje: 'Usuario y contraseña son obligatorios'
        });
    }

    try {
        const resultado = await pool.query(
            `SELECT id, nombre, usuario, password_hash, rol
             FROM usuarios
             WHERE usuario = $1 AND activo = TRUE`,
            [usuario.trim()]
        );

        const cuenta = resultado.rows[0];

        if (
            !cuenta ||
            !(await bcrypt.compare(password, cuenta.password_hash))
        ) {
            return res.status(401).json({
                mensaje: 'Usuario o contraseña incorrectos'
            });
        }

        const secreto = process.env.JWT_SECRET;

        if (!secreto || secreto.length < 32) {
            console.error('JWT_SECRET no está configurado correctamente');
            return res.status(500).json({
                mensaje: 'Error de configuración del servidor'
            });
        }

        const token = jwt.sign(
            {
                id: cuenta.id,
                rol: cuenta.rol
            },
            secreto,
            {
                expiresIn: '2h',
                issuer: 'theo-backend',
                audience: 'theo-app'
            }
        );

        res.json({
            mensaje: 'Inicio de sesión correcto',
            token,
            usuario: {
                id: cuenta.id,
                nombre: cuenta.nombre,
                usuario: cuenta.usuario,
                rol: cuenta.rol
            }
        });
    } catch (error) {
        console.error('Error al iniciar sesión:', error.message);
        res.status(500).json({
            mensaje: 'No se pudo iniciar sesión'
        });
    }
});

module.exports = router;
