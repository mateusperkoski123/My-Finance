const Dispositivo = require('../models/Dispositivo');
const User = require('../models/User');
const Assinatura = require('../models/Assinatura');

async function exigirToken(req, res, next) {
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7).trim();
    }

    if (!token) {
        return res.status(401).json({ sucesso: false, erro: 'token_ausente' });
    }

    try {
        const disp = await Dispositivo.buscarPorToken(token);
        if (!disp) {
            return res.status(401).json({ sucesso: false, erro: 'token_invalido' });
        }

        const user = await User.findById(disp.user_id);
        if (!user || (user.status && user.status !== 'ativo')) {
            return res.status(403).json({ sucesso: false, erro: 'conta_inativa' });
        }

        const ass = await Assinatura.obter(user.id);
        const statusEfetivo = ass ? ass.status_efetivo : 'trial';
        // Mesma regra do site: assinatura vencida/cancelada = somente leitura (admin e exceção).
        req.somenteLeitura = Boolean(ass && ass.somente_leitura && user.role !== 'admin');

        // Anexar usuario e dispositivo ao contexto da requisicao
        req.user = user;
        req.dispositivo = disp;
        req.assinatura = ass;
        req.statusEfetivo = statusEfetivo;

        // Atualizar ultimo uso de forma assincrona
        Dispositivo.atualizarUltimoUso(disp.id).catch(() => {});

        next();
    } catch (err) {
        console.error('Erro na autenticacao por token:', err);
        res.status(500).json({ sucesso: false, erro: 'erro_interno' });
    }
}

module.exports = { exigirToken };
