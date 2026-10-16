// Modulo Compras: so entra quem o admin liberou (users.compras_habilitado = 1). O admin sempre tem acesso.
function exigirCompras(req, res, next) {
    if (req.ehAdmin || (req.user && req.user.compras_habilitado)) return next();
    return res.status(404).render('404', { title: req.t('erro404.titulo') });
}

module.exports = { exigirCompras };
