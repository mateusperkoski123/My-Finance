// Textos legais (modelo). IMPORTANTE: revisar com um advogado antes de comercializar.
// Se alterar o conteudo de forma relevante, aumente TERMOS_VERSAO em negocio.js para que
// todos os usuarios precisem aceitar novamente.
const { NOME_APP, EMAIL_SUPORTE, TRIAL_DIAS } = require('./negocio');

function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

function textos(lang, precos) {
    const l = String(lang || '').toLowerCase();
    const contato = EMAIL_SUPORTE || '—';
    const b = fmt(precos.basico), p = fmt(precos.premium);
    const app = NOME_APP;

    if (l.startsWith('es')) {
        return {
            termos: [
                ['1. Aceptación', `Al crear una cuenta o usar ${app} usted acepta estos Términos de Uso y la Política de Privacidad. Si no está de acuerdo, no utilice el servicio.`],
                ['2. El servicio', `${app} es una herramienta de gestión financiera personal (cuentas, movimientos, categorías y reportes). No ofrece asesoría financiera, contable, legal ni de inversión; las decisiones son de su exclusiva responsabilidad.`],
                ['3. Cuenta y seguridad', 'Usted es responsable de la veracidad de sus datos, de mantener la confidencialidad de su contraseña y de toda actividad realizada con su cuenta. Avísenos de inmediato ante cualquier uso no autorizado.'],
                ['4. Prueba gratuita y planes', `Las cuentas nuevas disfrutan de ${TRIAL_DIAS} días de prueba gratuita (Plan de Prueba), sin necesidad de tarjeta. Al terminar la prueba, para seguir registrando información debe contratar un plan: Básico (${b} Gs./mes) o Premium (${p} Gs./mes), con descuento en el pago anual. Los precios pueden cambiar con aviso previo; el cambio no afecta períodos ya pagados.`],
                ['5. Pagos, renovación y reembolsos', 'La suscripción se paga por período adelantado (mensual o anual). Al vencer el período sin renovación, su cuenta pasa a modo de solo lectura: sigue pudiendo consultar y exportar sus datos, pero no registrar nuevos movimientos. Salvo que la ley disponga lo contrario, los pagos realizados no son reembolsables.'],
                ['6. Uso aceptable', 'Está prohibido usar el servicio para fines ilícitos, intentar acceder a datos de otros usuarios, vulnerar su seguridad, sobrecargarlo o revenderlo sin autorización.'],
                ['7. Sus datos', 'Los datos que usted registra le pertenecen. Puede exportarlos y puede eliminar su cuenta en cualquier momento desde Configuración; la eliminación borra definitivamente sus cuentas, categorías y movimientos.'],
                ['8. Disponibilidad y responsabilidad', 'Hacemos esfuerzos razonables para mantener el servicio disponible y sus datos protegidos, pero no garantizamos disponibilidad ininterrumpida. En la medida permitida por la ley, no respondemos por pérdidas indirectas derivadas del uso del servicio. Se recomienda realizar copias de seguridad periódicas.'],
                ['9. Suspensión y cancelación', 'Podemos suspender cuentas que incumplan estos términos. Usted puede cancelar su suscripción en cualquier momento; el acceso continúa hasta el fin del período pagado.'],
                ['10. Cambios', 'Podemos actualizar estos términos. Cuando el cambio sea relevante le pediremos que los acepte nuevamente.'],
                ['11. Ley aplicable', 'Estos términos se rigen por las leyes de la República del Paraguay.'],
                ['12. Contacto', `Consultas: ${contato}`]
            ],
            privacidade: [
                ['1. Datos que recopilamos', 'Datos de cuenta (nombre, correo, contraseña cifrada, idioma, moneda), datos financieros que usted registra (cuentas, movimientos, categorías), datos de uso y seguridad (fechas de acceso, dirección IP y navegador) y, si usa Google para iniciar sesión, su nombre y correo verificado.'],
                ['2. Para qué los usamos', 'Prestar el servicio, autenticarle, enviarle correos transaccionales (verificación, recuperación de contraseña, avisos de su suscripción), gestionar cobros, prevenir fraudes y mejorar el producto.'],
                ['3. Con quién los compartimos', 'No vendemos sus datos. Usamos proveedores necesarios para operar: hospedaje y base de datos (Hostinger), envío de correo y, cuando corresponda, procesadores de pago e inicio de sesión de Google. Solo reciben lo necesario para su función.'],
                ['4. Cuánto tiempo los conservamos', 'Mientras su cuenta esté activa. Si la elimina, borramos sus datos personales y financieros; solo conservamos registros de pago por obligaciones contables, sin vincularlos a su identidad.'],
                ['5. Sus derechos', 'Usted puede acceder, rectificar, exportar y eliminar sus datos. La exportación y la eliminación de la cuenta están disponibles en Configuración. Para otras solicitudes escríbanos.'],
                ['6. Seguridad', 'Las contraseñas se guardan cifradas (hash), las sesiones usan cookies protegidas y el acceso a la base de datos está restringido. Ningún sistema es 100 % infalible.'],
                ['7. Cookies', 'Usamos únicamente cookies técnicas de sesión, necesarias para mantener su acceso. No usamos cookies de publicidad.'],
                ['8. Menores de edad', 'El servicio no está dirigido a menores de 18 años.'],
                ['9. Cambios y contacto', `Podemos actualizar esta política y se lo informaremos. Contacto: ${contato}`]
            ],
            aviso: 'Documento modelo: debe ser revisado por un abogado antes de su uso comercial.'
        };
    }
    if (l.startsWith('en')) {
        return {
            termos: [
                ['1. Acceptance', `By creating an account or using ${app} you accept these Terms of Use and the Privacy Policy. If you do not agree, do not use the service.`],
                ['2. The service', `${app} is a personal finance management tool (accounts, transactions, categories and reports). It does not provide financial, accounting, legal or investment advice; decisions are solely your responsibility.`],
                ['3. Account and security', 'You are responsible for the accuracy of your data, for keeping your password confidential and for all activity under your account. Notify us immediately of any unauthorized use.'],
                ['4. Free trial and plans', `New accounts get a ${TRIAL_DIAS}-day free trial (Trial Plan), no card required. After the trial, to keep recording data you must subscribe to a plan: Basic (Gs. ${b}/month) or Premium (Gs. ${p}/month), with a discount for annual payment. Prices may change with prior notice; changes do not affect periods already paid.`],
                ['5. Payments, renewal and refunds', 'Subscriptions are paid in advance per period (monthly or annual). If the period ends without renewal, your account becomes read-only: you can still view and export your data but cannot add new transactions. Unless required by law, payments are non-refundable.'],
                ['6. Acceptable use', 'You may not use the service for unlawful purposes, try to access other users\' data, breach its security, overload it or resell it without authorization.'],
                ['7. Your data', 'The data you record belongs to you. You may export it and delete your account at any time in Settings; deletion permanently removes your accounts, categories and transactions.'],
                ['8. Availability and liability', 'We make reasonable efforts to keep the service available and your data protected but do not guarantee uninterrupted availability. To the extent permitted by law, we are not liable for indirect losses arising from use of the service. Regular backups are recommended.'],
                ['9. Suspension and cancellation', 'We may suspend accounts that breach these terms. You may cancel your subscription at any time; access continues until the end of the paid period.'],
                ['10. Changes', 'We may update these terms. For relevant changes we will ask you to accept them again.'],
                ['11. Governing law', 'These terms are governed by the laws of the Republic of Paraguay.'],
                ['12. Contact', `Questions: ${contato}`]
            ],
            privacidade: [
                ['1. Data we collect', 'Account data (name, e-mail, hashed password, language, currency), financial data you record (accounts, transactions, categories), usage and security data (access dates, IP address and browser) and, if you sign in with Google, your name and verified e-mail.'],
                ['2. What we use it for', 'To provide the service, authenticate you, send transactional e-mails (verification, password recovery, subscription notices), handle billing, prevent fraud and improve the product.'],
                ['3. Who we share it with', 'We do not sell your data. We use providers needed to operate: hosting and database (Hostinger), e-mail delivery and, where applicable, payment processors and Google sign-in. They only receive what is necessary for their function.'],
                ['4. How long we keep it', 'While your account is active. If you delete it, we erase your personal and financial data; we only keep payment records for accounting obligations, without linking them to your identity.'],
                ['5. Your rights', 'You may access, correct, export and delete your data. Export and account deletion are available in Settings. For other requests, contact us.'],
                ['6. Security', 'Passwords are stored hashed, sessions use protected cookies and database access is restricted. No system is 100% infallible.'],
                ['7. Cookies', 'We only use technical session cookies needed to keep you signed in. We do not use advertising cookies.'],
                ['8. Minors', 'The service is not directed to people under 18.'],
                ['9. Changes and contact', `We may update this policy and will let you know. Contact: ${contato}`]
            ],
            aviso: 'Template document: it must be reviewed by a lawyer before commercial use.'
        };
    }
    return {
        termos: [
            ['1. Aceitação', `Ao criar uma conta ou usar o ${app} você aceita estes Termos de Uso e a Política de Privacidade. Se não concordar, não utilize o serviço.`],
            ['2. O serviço', `O ${app} é uma ferramenta de gestão financeira pessoal (contas, lançamentos, categorias e relatórios). Não presta consultoria financeira, contábil, jurídica nem de investimentos; as decisões são de sua exclusiva responsabilidade.`],
            ['3. Conta e segurança', 'Você é responsável pela veracidade dos seus dados, por manter sua senha em sigilo e por toda atividade feita com a sua conta. Avise-nos imediatamente sobre qualquer uso não autorizado.'],
            ['4. Teste grátis e planos', `Contas novas têm ${TRIAL_DIAS} dias de teste grátis (Plano de Teste), sem necessidade de cartão. Ao final do teste, para continuar registrando dados é preciso contratar um plano: Básico (Gs. ${b}/mês) ou Premium (Gs. ${p}/mês), com desconto no pagamento anual. Os preços podem mudar mediante aviso prévio; a mudança não afeta períodos já pagos.`],
            ['5. Pagamentos, renovação e reembolso', 'A assinatura é paga antecipadamente por período (mensal ou anual). Se o período terminar sem renovação, sua conta passa ao modo somente leitura: você ainda consulta e exporta seus dados, mas não registra novos lançamentos. Salvo disposição legal em contrário, os pagamentos não são reembolsáveis.'],
            ['6. Uso aceitável', 'É proibido usar o serviço para fins ilícitos, tentar acessar dados de outros usuários, violar sua segurança, sobrecarregá-lo ou revendê-lo sem autorização.'],
            ['7. Seus dados', 'Os dados que você registra pertencem a você. Você pode exportá-los e excluir sua conta a qualquer momento em Configurações; a exclusão apaga definitivamente suas contas, categorias e lançamentos.'],
            ['8. Disponibilidade e responsabilidade', 'Empregamos esforços razoáveis para manter o serviço disponível e seus dados protegidos, mas não garantimos disponibilidade ininterrupta. Na medida permitida em lei, não respondemos por perdas indiretas decorrentes do uso. Recomenda-se fazer backups periódicos.'],
            ['9. Suspensão e cancelamento', 'Podemos suspender contas que descumpram estes termos. Você pode cancelar a assinatura a qualquer momento; o acesso continua até o fim do período pago.'],
            ['10. Alterações', 'Podemos atualizar estes termos. Em mudanças relevantes pediremos que você aceite novamente.'],
            ['11. Lei aplicável', 'Estes termos são regidos pelas leis da República do Paraguai.'],
            ['12. Contato', `Dúvidas: ${contato}`]
        ],
        privacidade: [
            ['1. Dados que coletamos', 'Dados de conta (nome, e-mail, senha criptografada, idioma, moeda), dados financeiros que você registra (contas, lançamentos, categorias), dados de uso e segurança (datas de acesso, endereço IP e navegador) e, se entrar com o Google, seu nome e e-mail verificado.'],
            ['2. Para que usamos', 'Prestar o serviço, autenticar você, enviar e-mails transacionais (verificação, recuperação de senha, avisos da assinatura), gerenciar cobranças, prevenir fraudes e melhorar o produto.'],
            ['3. Com quem compartilhamos', 'Não vendemos seus dados. Usamos fornecedores necessários à operação: hospedagem e banco de dados (Hostinger), envio de e-mail e, quando houver, processadores de pagamento e login do Google. Eles recebem apenas o necessário para sua função.'],
            ['4. Por quanto tempo guardamos', 'Enquanto sua conta estiver ativa. Se você a excluir, apagamos seus dados pessoais e financeiros; mantemos apenas registros de pagamento por obrigação contábil, sem vínculo com sua identidade.'],
            ['5. Seus direitos', 'Você pode acessar, corrigir, exportar e excluir seus dados. Exportação e exclusão da conta estão em Configurações. Para outras solicitações, fale conosco.'],
            ['6. Segurança', 'Senhas são armazenadas com hash, as sessões usam cookies protegidos e o acesso ao banco é restrito. Nenhum sistema é 100% infalível.'],
            ['7. Cookies', 'Usamos apenas cookies técnicos de sessão, necessários para manter seu acesso. Não usamos cookies de publicidade.'],
            ['8. Menores de idade', 'O serviço não é destinado a menores de 18 anos.'],
            ['9. Alterações e contato', `Podemos atualizar esta política e avisaremos você. Contato: ${contato}`]
        ],
        aviso: 'Documento modelo: deve ser revisado por um advogado antes do uso comercial.'
    };
}

module.exports = { textos, fmt };
