
const express = require('express');
const router = express.Router();
const pool = require('../config/database');

const {
    verificarToken,
    permitirRoles
} = require('../middleware/auth');

async function protegerRegistroPedido(req, res, next) {
    if (req.body.tipo_pedido !== 'Mesa') {
        return next();
    }

    verificarToken(req, res, () => {
        permitirRoles('admin', 'mesero')(req, res, next);
    });
}

// Registrar un pedido completo
router.post('/', protegerRegistroPedido, async (req, res) => {
    const {
        cliente_nombre,
        cliente_direccion,
        cliente_telefono,
        metodo_pago,
        nota,
        tipo_pedido = 'Domicilio',
        numero_mesa,
        productos
    } = req.body;

    // Validar los datos generales
    if (
        typeof cliente_nombre !== 'string' ||
        !cliente_nombre.trim() ||
        !['Efectivo', 'Transferencia'].includes(metodo_pago) ||
        !['Domicilio', 'Mesa'].includes(tipo_pedido) ||
        !Array.isArray(productos) ||
        productos.length === 0
    ) {
        return res.status(400).json({
            mensaje: 'Los datos del pedido no son válidos'
        });
    }

    if (
        tipo_pedido === 'Domicilio' &&
        (typeof cliente_direccion !== 'string' ||
            !cliente_direccion.trim())
    ) {
        return res.status(400).json({
            mensaje: 'La dirección es obligatoria para domicilios'
        });
    }

    if (
        tipo_pedido === 'Mesa' &&
        (!Number.isInteger(numero_mesa) || numero_mesa < 1)
    ) {
        return res.status(400).json({
            mensaje: 'Debes indicar un número de mesa válido'
        });
    }

    // Validar los productos y las cantidades
    const cantidades = new Map();

    for (const item of productos) {
        if (
            !Number.isInteger(item.producto_id) ||
            item.producto_id < 1 ||
            !Number.isInteger(item.cantidad) ||
            item.cantidad < 1
        ) {
            return res.status(400).json({
                mensaje: 'Hay productos o cantidades no válidos'
            });
        }

        const cantidadTotal =
            (cantidades.get(item.producto_id) || 0) + item.cantidad;

        if (!Number.isSafeInteger(cantidadTotal)) {
            return res.status(400).json({
                mensaje: 'La cantidad solicitada es demasiado grande'
            });
        }

        cantidades.set(item.producto_id, cantidadTotal);
    }

    const conexion = await pool.connect();
    let transaccionIniciada = false;

    try {
        await conexion.query('BEGIN');
        transaccionIniciada = true;

        const ids = [...cantidades.keys()];

        // Obtener los precios reales y bloquear los productos
        const resultadoProductos = await conexion.query(
            `SELECT id, nombre, precio
             FROM productos
             WHERE id = ANY($1::int[])
               AND disponible = TRUE
             ORDER BY id
             FOR SHARE`,
            [ids]
        );

        if (resultadoProductos.rows.length !== ids.length) {
            await conexion.query('ROLLBACK');
            transaccionIniciada = false;

            return res.status(400).json({
                mensaje: 'Uno o más productos no existen o no están disponibles'
            });
        }

        const catalogo = new Map(
            resultadoProductos.rows.map(producto => [
                producto.id,
                producto
            ])
        );


        const opcionesPorProducto = new Map();

        for (const item of productos) {
            const opcion = typeof item.opcion === 'string'
                ? item.opcion.trim()
                : '';

            if (opcion) {
                const opcionesValidas = {
                    2: ['Café', 'Oreo', 'Milo'],
                    21: ['Mora', 'Mango', 'Lulo', 'Maracuyá'],
                    34: ['Mora', 'Mango', 'Lulo', 'Maracuyá']
                };

                if (
                    !opcionesValidas[item.producto_id] ||
                    !opcionesValidas[item.producto_id].includes(opcion)
                ) {
                    throw new Error('La opción seleccionada no es válida');
                }

                opcionesPorProducto.set(item.producto_id, opcion);
            }
        }

        let total = 0;

        const detalle = [...cantidades.entries()].map(
            ([productoId, cantidad]) => {
                const producto = catalogo.get(productoId);
                const precio = Number(producto.precio);
                const subtotal = precio * cantidad;

                if (
                    !Number.isFinite(precio) ||
                    !Number.isSafeInteger(Math.round(subtotal * 100))
                ) {
                    throw new Error('Precio o subtotal fuera de rango');
                }

                total += Math.round(subtotal * 100);

                return {
                    producto_id: producto.id,
                    nombre: producto.nombre,
                    cantidad,
                    precio_unitario: precio,
                    subtotal: Math.round(subtotal * 100) / 100,
                    opcion: opcionesPorProducto.get(productoId) || null
                };
            }
        );

        total = total / 100;

        if (
            !Number.isFinite(total) ||
            !Number.isSafeInteger(Math.round(total * 100)) ||
            total > 99999999.99
        ) {
            throw new Error('El total del pedido está fuera de rango');
        }

        // Crear el pedido
        const resultadoPedido = await conexion.query(
            `INSERT INTO pedidos (
                cliente_nombre,
                cliente_direccion,
                cliente_telefono,
                metodo_pago,
                nota,
                tipo_pedido,
                numero_mesa,
                total
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *`,
            [
                cliente_nombre.trim(),
                cliente_direccion || null,
                cliente_telefono || null,
                metodo_pago,
                nota || null,
                tipo_pedido,
                tipo_pedido === 'Mesa' ? numero_mesa : null,
                total
            ]
        );

        const pedido = resultadoPedido.rows[0];

        // Guardar cada producto del pedido
        for (const item of detalle) {
            await conexion.query(
                `INSERT INTO detalle_pedido (
        pedido_id,
        producto_id,
        nombre_producto,
        cantidad,
        precio_unitario,
        subtotal,
        opcion
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    pedido.id,
                    item.producto_id,
                    item.nombre,
                    item.cantidad,
                    item.precio_unitario,
                    item.subtotal,
                    item.opcion
                ]
            );
        }

        await conexion.query('COMMIT');
        transaccionIniciada = false;

        res.status(201).json({
            mensaje: 'Pedido registrado correctamente',
            pedido,
            productos: detalle
        });
    } catch (error) {
        if (transaccionIniciada) {
            try {
                await conexion.query('ROLLBACK');
            } catch (errorRollback) {
                console.error('Error al revertir la transacción:', errorRollback.message);
            }
        }

        console.error('Error al registrar pedido:', error.message);

        res.status(500).json({
            mensaje: 'No se pudo registrar el pedido'
        });
    } finally {
        conexion.release();
    }
});


// Consultar todos los pedidos registrados
router.get(
    '/',
    verificarToken,
    permitirRoles('admin'),
    async (req, res) => {
        try {
            const resultado = await pool.query(`
            SELECT
                p.*,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'producto_id', d.producto_id,
                            'nombre', d.nombre_producto,
                            'opcion', d.opcion,
                            'cantidad', d.cantidad,
                            'precio', d.precio_unitario,
                            'subtotal', d.subtotal
                        )
                    ) FILTER (WHERE d.id IS NOT NULL),
                    '[]'::json
                ) AS productos
            FROM pedidos p
            LEFT JOIN detalle_pedido d ON d.pedido_id = p.id
            GROUP BY p.id
            ORDER BY p.creado_en DESC
        `);

            res.json(resultado.rows);
        } catch (error) {
            console.error('Error al consultar pedidos:', error.message);
            res.status(500).json({
                mensaje: 'No se pudieron consultar los pedidos'
            });
        }
    });


// Actualizar el estado de un pedido
router.patch(
    '/:id/estado',
    verificarToken,
    permitirRoles('admin'),
    async (req, res) => {
        const id = Number(req.params.id);
        const { estado } = req.body;

        const estadosPermitidos = [
            'Pendiente',
            'En preparación',
            'Listo',
            'En camino',
            'Entregado',
            'Cancelado'
        ];

        if (!Number.isInteger(id) || id < 1) {
            return res.status(400).json({
                mensaje: 'El número de pedido no es válido'
            });
        }

        if (!estadosPermitidos.includes(estado)) {
            return res.status(400).json({
                mensaje: 'El estado indicado no es válido'
            });
        }

        try {
            const resultado = await pool.query(
                `UPDATE pedidos
             SET estado = $1
             WHERE id = $2
             RETURNING *`,
                [estado, id]
            );

            if (resultado.rows.length === 0) {
                return res.status(404).json({
                    mensaje: 'No se encontró el pedido'
                });
            }

            res.json({
                mensaje: 'Estado actualizado correctamente',
                pedido: resultado.rows[0]
            });
        } catch (error) {
            console.error('Error al actualizar el estado:', error.message);

            res.status(500).json({
                mensaje: 'No se pudo actualizar el estado del pedido'
            });
        }
    });



module.exports = router;
