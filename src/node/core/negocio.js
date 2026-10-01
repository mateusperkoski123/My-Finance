// Constantes de negocio centralizadas.
module.exports = {
    NOME_APP: process.env.APP_NAME || 'MyFinance',
    TRIAL_DIAS: 7,
    // Mudar este valor obriga todos os usuarios a aceitar os termos novamente.
    TERMOS_VERSAO: '1.0',
    EMAIL_SUPORTE: process.env.SUPPORT_EMAIL || '',
    CICLOS: ['mensal', 'anual'],
    // Rotas que continuam funcionando quando a assinatura venceu/cancelou (modo somente leitura).
    ROTAS_LIVRES_SOMENTE_LEITURA: ['/logout', '/assinatura', '/aceitar-termos', '/verificar-email', '/admin', '/configuracoes', '/ia'],
    // Dentro de /configuracoes, esta acao grava dados financeiros e fica bloqueada em somente leitura.
    ROTAS_BLOQUEADAS_SOMENTE_LEITURA: ['/configuracoes/dados/importar']
};
