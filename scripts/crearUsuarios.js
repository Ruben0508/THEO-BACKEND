
require('dotenv').config();

const bcrypt = require('bcryptjs');
const pool = require('../config/database');

async function crearUsuarios() {
    const usuarios = [
        {
            nombre: 'Administrador THEO',
            usuario: 'admin',
            password: process.env.ADMIN_PASSWORD,
            rol: 'admin'
        },
        {
            nombre: 'Mesero THEO',
            usuario: 'mesero',
            password: process.env.MESERO_PASSWORD,
            rol: 'mesero'
        }
    ];

    try {
        for (const usuario of usuarios) {
            if (!usuario.password || usuario.password.length < 12) {
                throw new Error(
                    `Configura una contraseña de al menos 12 caracteres para ${usuario.usuario} en .env`
                );
            }

            const hash = await bcrypt.hash(usuario.password, 12);

            await pool.query(
                `INSERT INTO usuarios
                    (nombre, usuario, password_hash, rol)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (usuario)
                 DO NOTHING`,
                [usuario.nombre, usuario.usuario, hash, usuario.rol]
            );

            console.log(`Usuario procesado: ${usuario.usuario}`);
        }
    } catch (error) {
        console.error('Error al crear usuarios:', error.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

crearUsuarios();
