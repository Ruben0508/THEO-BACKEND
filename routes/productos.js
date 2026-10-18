
const express = require('express');
const router = express.Router();
const pool = require('../config/database');

const {
    verificarToken,
    permitirRoles
} = require('../middleware/auth');

// Consultar productos: acceso público
router.get('/', async (req, res) => {
    try {
        const resultado = await pool.query(
            'SELECT * FROM productos ORDER BY id ASC'
        );

        res.json(resultado.rows);
    } catch (error) {
        console.error('Error al consultar productos:', error.message);
        res.status(500).json({
            mensaje: 'Error al consultar los productos'
        });
    }
});

// Registrar producto: solo administrador
router.post(
    '/',
    verificarToken,
    permitirRoles('admin'),
    async (req, res) => {
        const {
            nombre, descripcion, precio, categoria, imagen_url
        } = req.body;

        const opciones = req.body.opciones ?? [];

        if (
            !Array.isArray(opciones) ||
            !opciones.every(opcion =>
                typeof opcion === 'string' && opcion.trim()
            )
        ) {
            return res.status(400).json({
                mensaje: 'Las opciones del producto no son válidas'
            });
        }

        const opcionesLimpias = opciones.map(opcion => opcion.trim());

        if (
            typeof nombre !== 'string' || !nombre.trim() ||
            typeof categoria !== 'string' || !categoria.trim() ||
            precio === undefined || precio === null ||
            precio === '' || !Number.isFinite(Number(precio)) ||
            Number(precio) < 0
        ) {
            return res.status(400).json({
                mensaje: 'Nombre, categoría y precio válido son obligatorios'
            });
        }

        try {
            const resultado = await pool.query(
                `INSERT INTO productos
                  (nombre, descripcion, precio, categoria, imagen_url, opciones)
                   VALUES ($1, $2, $3, $4, $5, $6::jsonb)
                   RETURNING *`,
                [
                    nombre.trim(),
                    descripcion || null,
                    Number(precio),
                    categoria.trim(),
                    imagen_url || null,
                    JSON.stringify(opcionesLimpias)
                ]
            );

            res.status(201).json({
                mensaje: 'Producto registrado correctamente',
                producto: resultado.rows[0]
            });
        } catch (error) {
            console.error('Error al registrar producto:', error.message);
            res.status(500).json({
                mensaje: 'Error al registrar el producto'
            });
        }
    }
);

// Actualizar producto: solo administrador
router.put(
    '/:id',
    verificarToken,
    permitirRoles('admin'),
    async (req, res) => {
        const { id } = req.params;
        const {
            nombre, descripcion, precio, categoria,
            imagen_url, disponible
        } = req.body;

        const opciones = req.body.opciones;

        if (
            opciones !== undefined &&
            (
                !Array.isArray(opciones) ||
                !opciones.every(opcion =>
                    typeof opcion === 'string' && opcion.trim()
                )
            )
        ) {
            return res.status(400).json({
                mensaje: 'Las opciones del producto no son válidas'
            });
        }

        if (!/^[1-9]\d*$/.test(id)) {
            return res.status(400).json({
                mensaje: 'El ID del producto no es válido'
            });
        }

        if (
            (nombre !== undefined &&
                (typeof nombre !== 'string' || !nombre.trim())) ||
            (categoria !== undefined &&
                (typeof categoria !== 'string' || !categoria.trim())) ||
            (precio !== undefined &&
                (precio === '' || !Number.isFinite(Number(precio)) ||
                    Number(precio) < 0)) ||
            (disponible !== undefined &&
                typeof disponible !== 'boolean')
        ) {
            return res.status(400).json({
                mensaje: 'Los datos enviados no son válidos'
            });
        }

        try {
            const resultado = await pool.query(
                `UPDATE productos
                 SET nombre = COALESCE($1, nombre),
                    descripcion = COALESCE($2, descripcion),
                    precio = COALESCE($3, precio),
                    categoria = COALESCE($4, categoria),
                    imagen_url = COALESCE($5, imagen_url),
                    opciones = COALESCE($6::jsonb, opciones),
                    disponible = COALESCE($7, disponible)
                  WHERE id = $8
                  RETURNING *`,
                [
                    nombre === undefined ? null : nombre.trim(),
                    descripcion === undefined ? null : descripcion,
                    precio === undefined ? null : Number(precio),
                    categoria === undefined ? null : categoria.trim(),
                    imagen_url === undefined ? null : imagen_url,
                    opciones === undefined ? null : JSON.stringify(
                        opciones.map(opcion => opcion.trim())
                    ),
                    disponible === undefined ? null : disponible,
                    Number(id)
                ]
            );

            if (resultado.rows.length === 0) {
                return res.status(404).json({
                    mensaje: 'Producto no encontrado'
                });
            }

            res.json({
                mensaje: 'Producto actualizado correctamente',
                producto: resultado.rows[0]
            });
        } catch (error) {
            console.error('Error al actualizar producto:', error.message);
            res.status(500).json({
                mensaje: 'Error al actualizar el producto'
            });
        }
    }
);

// Cambiar disponibilidad: solo administrador
router.patch(
    '/:id/disponibilidad',
    verificarToken,
    permitirRoles('admin'),
    async (req, res) => {
        const { id } = req.params;
        const { disponible } = req.body;

        if (!/^[1-9]\d*$/.test(id)) {
            return res.status(400).json({
                mensaje: 'El ID del producto no es válido'
            });
        }

        if (typeof disponible !== 'boolean') {
            return res.status(400).json({
                mensaje: 'Debes indicar disponible como true o false'
            });
        }

        try {
            const resultado = await pool.query(
                `UPDATE productos
                 SET disponible = $1
                 WHERE id = $2
                 RETURNING *`,
                [disponible, Number(id)]
            );

            if (resultado.rows.length === 0) {
                return res.status(404).json({
                    mensaje: 'Producto no encontrado'
                });
            }

            res.json({
                mensaje: disponible
                    ? 'Producto habilitado correctamente'
                    : 'Producto retirado del menú correctamente',
                producto: resultado.rows[0]
            });
        } catch (error) {
            console.error('Error al cambiar disponibilidad:', error.message);
            res.status(500).json({
                mensaje: 'Error al cambiar la disponibilidad'
            });
        }
    }
);

module.exports = router;
