// Modulo Clientes: so entra quem o admin liberou (users.clientes_habilitado = 1). O admin sempre tem acesso.
function exigirClientes(req, res, next) {
    if (req.ehAdmin || (req.user && req.user.clientes_habilitado)) return next();
    return res.status(404).render('404', { title: req.t('erro404.titulo') });
}

module.exports = { exigirClientes };
