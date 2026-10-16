
const jwt = require('jsonwebtoken');

function verificarToken(req, res, next) {
    const autorizacion = req.headers.authorization;

    if (!autorizacion || !autorizacion.startsWith('Bearer ')) {
        return res.status(401).json({
            mensaje: 'Debes iniciar sesión para acceder'
        });
    }

    const token = autorizacion.slice(7);
    const secreto = process.env.JWT_SECRET;

    if (!secreto) {
        return res.status(500).json({
            mensaje: 'Error de configuración del servidor'
        });
    }

    try {
        const datos = jwt.verify(token, secreto, {
            issuer: 'theo-backend',
            audience: 'theo-app'
        });

        if (
            !Number.isInteger(datos.id) ||
            !['admin', 'mesero'].includes(datos.rol)
        ) {
            return res.status(401).json({
                mensaje: 'Token inválido'
            });
        }

        req.usuario = {
            id: datos.id,
            rol: datos.rol
        };

        next();
    } catch (error) {
        return res.status(401).json({
            mensaje: 'Sesión inválida o vencida'
        });
    }
}

function permitirRoles(...rolesPermitidos) {
    return (req, res, next) => {
        if (!req.usuario || !rolesPermitidos.includes(req.usuario.rol)) {
            return res.status(403).json({
                mensaje: 'No tienes permiso para realizar esta acción'
            });
        }

        next();
    };
}

module.exports = {
    verificarToken,
    permitirRoles
};
