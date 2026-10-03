// Constantes de negocio centralizadas.
module.exports = {
    NOME_APP: process.env.APP_NAME || 'MyFinance',
    // Teste gratis: a pessoa escolhe o plano e usa esse plano por TRIAL_DIAS dias (uma vez so).
    TRIAL_DIAS: 3,
    // Limite mensal de mensagens do Chat IA quando o plano nao define um (planos.ia_limite_mes).
    IA_LIMITE_PADRAO: parseInt(process.env.IA_LIMITE_MENSAGENS_MES || '300', 10),
    // Mudar este valor obriga todos os usuarios a aceitar os termos novamente.
    TERMOS_VERSAO: '1.2',
    EMAIL_SUPORTE: process.env.SUPPORT_EMAIL || '',
    CICLOS: ['mensal', 'anual'],
    // Planos que podem ser testados e contratados (o "prueba" e o teste antigo de 7 dias, com tudo liberado).
    PLANOS_VENDA: ['basico', 'premium', 'pro'],
    // Rotas que continuam funcionando quando a assinatura venceu/cancelou (modo somente leitura).
    ROTAS_LIVRES_SOMENTE_LEITURA: ['/logout', '/assinatura', '/aceitar-termos', '/verificar-email', '/admin', '/configuracoes', '/ia'],
    // Dentro de /configuracoes, esta acao grava dados financeiros e fica bloqueada em somente leitura.
    ROTAS_BLOQUEADAS_SOMENTE_LEITURA: ['/configuracoes/dados/importar'],
    // Unicas rotas abertas para quem ainda nao escolheu o plano do teste ou ja usou o teste e nao contratou:
    // escolher/contratar um plano, sair, ler os termos e excluir a propria conta.
    ROTAS_LIVRES_BLOQUEIO: ['/logout', '/api/app/logout', '/assinatura', '/teste', '/termos', '/privacidade', '/aceitar-termos', '/verificar-email', '/configuracoes/conta', '/perfil/foto', '/idioma', '/offline', '/landing']
};
