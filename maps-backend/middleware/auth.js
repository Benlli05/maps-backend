const { jwtVerify, decodeJwt } = require('jose');

const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET;
const MAPS_DOMAIN = process.env.MAPS_DOMAIN || 'maps.segundapailahueque.cl';

const FULL_ACCESS_ROLES = ['superadmin'];

/**
 * Verifica el JWT de NextAuth (JWE cifrado con NEXTAUTH_SECRET).
 * NextAuth v4 usa jose internamente con algoritmo dir + A256GCM por defecto.
 * El payload contiene: id, username, rol, permisos[], sub, iat, exp, jti.
 */
async function decodeNextAuthToken(rawToken) {
  if (!NEXTAUTH_SECRET) {
    throw new Error('NEXTAUTH_SECRET no configurado en .env');
  }

  const secret = new TextEncoder().encode(NEXTAUTH_SECRET);

  // Intentar primero como JWS (signed)
  try {
    const { payload } = await jwtVerify(rawToken, secret, {
      algorithms: ['HS256', 'HS512'],
      issuer: 'intranetbomberos',
      audience: 'maps',
    });
    return payload;
  } catch {}

  // NextAuth v4 usa JWE (encrypted) — intentar con jose compacto
  try {
    const { compactDecrypt } = require('jose');
    const { plaintext } = await compactDecrypt(rawToken, secret);
    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch {}

  return null;
}

/**
 * Middleware principal: verifica el JWT de NextAuth y valida permisos de dominio.
 * El token se obtiene desde tv.segundapailahueque.cl/api/auth/token
 * y se envía como: Authorization: Bearer <token>
 *
 * Permisos para maps.segundapailahueque.cl:
 *   - superadmin  → acceso total
 *   - admin con 'ver_mapas' o 'gestionar_mapas' → lectura
 *   - admin con 'gestionar_mapas' → escritura
 */
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  const rawToken = authHeader.slice(7);

  try {
    const payload = await decodeNextAuthToken(rawToken);
    if (!payload) {
      console.error('[verifyToken] decodeNextAuthToken devolvió null — token inválido o secret incorrecto');
      return res.status(401).json({ error: 'Token inválido o expirado' });
    }

    const userId = payload.id || payload.sub;
    const username = payload.username || payload.name;
    const rol = payload.rol;
    const permisos = Array.isArray(payload.permisos) ? payload.permisos : [];

    const apps = Array.isArray(payload.apps) ? payload.apps : [];

    console.log(`[verifyToken] OK → user: ${username}, rol: ${rol}, permisos: [${permisos.join(', ')}], apps: [${apps.map(a => typeof a === 'string' ? a : a.url).join(', ')}]`);

    if (!userId || !rol) {
      console.error('[verifyToken] Token sin userId o rol:', { userId, rol });
      return res.status(401).json({ error: 'Token sin datos de usuario' });
    }

    req.user = { id: userId, username, rol, permisos, apps };

    if (!hasDomainAccess(req.user, MAPS_DOMAIN, 'read')) {
      console.warn(`[verifyToken] ${username} sin acceso de lectura a ${MAPS_DOMAIN}`);
      return res.status(403).json({
        error: `Sin acceso a ${MAPS_DOMAIN}`,
        requiredPermission: 'ver_mapas o URL directa',
      });
    }

    next();
  } catch (err) {
    console.error('[verifyToken] Error:', err.message);
    return res.status(401).json({ error: 'Error de autenticación' });
  }
};

/**
 * Comprueba si un usuario tiene acceso al dominio dado.
 * action: 'read' | 'write'
 */
function hasDomainAccess(user, domain, action = 'read') {
  if (!user) return false;
  if (FULL_ACCESS_ROLES.includes(user.rol)) return true;

  const hasAppAccess = Array.isArray(user.apps) && user.apps.some(a => { const u = typeof a === 'string' ? a : a.url; return u && (u.includes(domain) || u.includes('localhost:4000')); });

  if (action === 'read') {
    return hasAppAccess || user.permisos.includes('ver_mapas') ||
           user.permisos.includes('gestionar_mapas');
  }
  if (action === 'write') {
    return user.permisos.includes('gestionar_mapas');
  }
  return false;
}

/**
 * Middleware: requiere rol específico
 */
const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.rol)) {
    return res.status(403).json({ error: 'Rol insuficiente' });
  }
  next();
};

/**
 * Middleware: requiere permiso de escritura en el dominio maps
 */
const requireWriteAccess = (req, res, next) => {
  const user = req.user;
  console.log(`[requireWriteAccess] user: ${user?.username}, rol: ${user?.rol}, permisos: [${user?.permisos?.join(', ')}]`);
  if (!hasDomainAccess(user, MAPS_DOMAIN, 'write')) {
    console.warn(`[requireWriteAccess] RECHAZADO → ${user?.username} no tiene gestionar_mapas ni es superadmin`);
    return res.status(403).json({
      error: `Se requiere permiso "gestionar_mapas" en ${MAPS_DOMAIN}`,
      requiredPermission: 'gestionar_mapas',
      yourRole: user?.rol,
      yourPermisos: user?.permisos,
    });
  }
  next();
};

module.exports = { verifyToken, requireRole, requireWriteAccess, hasDomainAccess };
