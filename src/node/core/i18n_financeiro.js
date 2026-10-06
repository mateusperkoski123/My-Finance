// Traducoes do "Financeiro" (cobrancas por inatividade): 'chave': [pt-BR, es-PY, en-US].
// As mensagens ficam em 'financeiro.msg.<tom>.<1..10>' (1-5 no envio das 8h, 6-10 na variacao das 13h); {n} e o numero de dias sem registrar.
module.exports = {
    'financeiro.nome': ['Financeiro', 'Financiero', 'Mr. Finance'],

    // ---- Tom 1: brincalhao (nada registrado hoje) ----
    'financeiro.msg.brincalhao.1': ['Já gastou algo hoje ou o café foi por conta da casa? ☕', '¿Ya gastaste algo hoy o el café lo pagó otro? ☕', 'Spent anything today, or was the coffee on the house? ☕'],
    'financeiro.msg.brincalhao.2': ['Passando só para perguntar: esqueceu de anotar alguma coisa hoje? 👀', 'Paso solo a preguntar: ¿te olvidaste de anotar algo hoy? 👀', 'Just checking in: did you forget to log something today? 👀'],
    'financeiro.msg.brincalhao.3': ['Seu dinheiro não some sozinho, mas some. Bora registrar o de hoje?', 'Tu plata no desaparece sola, pero desaparece. ¿Registramos lo de hoy?', 'Your money doesn\'t vanish on its own, but it does vanish. Shall we log today\'s?'],
    'financeiro.msg.brincalhao.4': ['Hoje teve pix, cartão ou aquela comprinha "rápida"? Me conta!', '¿Hoy hubo transferencia, tarjeta o esa compra "rápida"? ¡Contame!', 'Any card swipes, transfers or that "quick" purchase today? Tell me!'],
    'financeiro.msg.brincalhao.5': ['30 segundos para registrar o dia e eu te deixo em paz. Prometo! 😉', '30 segundos para registrar el día y te dejo en paz. ¡Prometido! 😉', '30 seconds to log your day and I\'ll leave you alone. Promise! 😉'],
    'financeiro.msg.brincalhao.6': ['O almoço já passou. Deu tempo de gastar alguma coisa? Registra aí! 🍽️', '¿Ya pasó el almuerzo? ¿Alcanzaste a gastar algo? ¡Registralo! 🍽️', 'Lunch is over. Did you spend anything? Log it! 🍽️'],
    'financeiro.msg.brincalhao.7': ['Meio-dia e nada por aqui. Dia econômico ou esqueceu de anotar? 🤔', 'Mediodía y nada por acá. ¿Día ahorrativo o te olvidaste de anotar? 🤔', 'Midday and nothing here. Frugal day, or did you forget to log? 🤔'],
    'financeiro.msg.brincalhao.8': ['Lembrete da tarde: um gasto anotado agora poupa trabalho à noite. 😄', 'Recordatorio de la tarde: un gasto anotado ahora te ahorra trabajo a la noche. 😄', 'Afternoon reminder: one expense logged now saves you work tonight. 😄'],
    'financeiro.msg.brincalhao.9': ['Voltei! O cafezinho da tarde também conta, viu? ☕', '¡Volví! El cafecito de la tarde también cuenta, ¿eh? ☕', 'I\'m back! The afternoon coffee counts too, you know? ☕'],
    'financeiro.msg.brincalhao.10': ['Aproveita o intervalo para anotar o que já gastou hoje? Leva só 30 segundos. ⏱️', '¿Aprovechás el descanso para anotar lo que ya gastaste hoy? Son solo 30 segundos. ⏱️', 'Use your break to log what you\'ve spent today? Just 30 seconds. ⏱️'],

    // ---- Tom 2: cobrando (2 dias sem registrar) ----
    'financeiro.msg.cobrando.1': ['Faz {n} dias que não tenho notícias suas. Nesse tempo, nada foi gasto? Sei...', 'Hace {n} días que no sé nada de vos. En ese tiempo, ¿no gastaste nada? Ajá...', 'It\'s been {n} days since I heard from you. Nothing spent in all that time? Sure...'],
    'financeiro.msg.cobrando.2': ['{n} dias de silêncio e o dinheiro continuando a sair. Vamos atualizar?', '{n} días de silencio y la plata sigue saliendo. ¿Actualizamos?', '{n} days of silence and the money keeps going out. Shall we catch up?'],
    'financeiro.msg.cobrando.3': ['Eu não quero ser chato, mas estou anotando que você sumiu {n} dias. 📝', 'No quiero ser pesado, pero estoy anotando que desapareciste {n} días. 📝', 'I don\'t want to be a pain, but I\'m noting that you vanished for {n} days. 📝'],
    'financeiro.msg.cobrando.4': ['Esqueceu de mim? Tem {n} dias de gastos esperando para serem registrados.', '¿Te olvidaste de mí? Hay {n} días de gastos esperando ser registrados.', 'Forgot about me? {n} days of expenses are waiting to be logged.'],
    'financeiro.msg.cobrando.5': ['Quanto mais a gente deixa acumular, mais difícil é lembrar. Bora pôr em dia?', 'Cuanto más se acumula, más difícil es acordarse. ¿Nos ponemos al día?', 'The more it piles up, the harder it is to remember. Let\'s catch up?'],
    'financeiro.msg.cobrando.6': ['Segunda chamada: já são {n} dias sem registrar. Que tal aproveitar o intervalo do almoço?', 'Segundo llamado: ya son {n} días sin registrar. ¿Y si aprovechás el descanso del almuerzo?', 'Second call: it\'s already been {n} days without logging. How about using your lunch break?'],
    'financeiro.msg.cobrando.7': ['Passei de manhã e você não respondeu. {n} dias de gastos ainda esperando! 📝', 'Pasé a la mañana y no respondiste. ¡{n} días de gastos todavía esperando! 📝', 'I stopped by this morning and no answer. {n} days of expenses are still waiting! 📝'],
    'financeiro.msg.cobrando.8': ['Meio do dia e continuo sem notícias suas há {n} dias. Só um gasto, vai.', 'Mitad del día y sigo sin noticias tuyas hace {n} días. Solo un gasto, dale.', 'Midday and still no word from you in {n} days. Just one expense, come on.'],
    'financeiro.msg.cobrando.9': ['Estou aqui de novo, {n} dias depois da última vez que você anotou algo. Vamos acertar isso?', 'Acá estoy de nuevo, {n} días después de la última vez que anotaste algo. ¿Lo arreglamos?', 'Here I am again, {n} days after the last time you logged anything. Shall we fix that?'],
    'financeiro.msg.cobrando.10': ['Cada hora que passa é um gasto a menos na memória. {n} dias sem registrar, hein?', 'Cada hora que pasa es un gasto menos en la memoria. {n} días sin registrar, ¿eh?', 'Every hour that passes is one less expense in your memory. {n} days without logging, huh?'],

    // ---- Tom 3: dramatico (3 a 4 dias sem registrar) ----
    'financeiro.msg.dramatico.1': ['{n} dias sem registrar nada. Estou começando a me preocupar com você. 😰', '{n} días sin registrar nada. Empiezo a preocuparme por vos. 😰', '{n} days without logging anything. I\'m starting to worry about you. 😰'],
    'financeiro.msg.dramatico.2': ['Alô? Terra chamando! Seus gastos continuam acontecendo, só eu que não estou sabendo.', '¿Hola? ¡Tierra llamando! Tus gastos siguen ocurriendo, solo yo no me entero.', 'Hello? Earth calling! Your spending keeps happening, I\'m just the last to know.'],
    'financeiro.msg.dramatico.3': ['Eu estava aqui, firme, esperando. E você nem uma transação para me contar? 🥲', 'Yo acá, firme, esperando. ¿Y vos ni una transacción para contarme? 🥲', 'I\'ve been right here, waiting. And you couldn\'t send me a single transaction? 🥲'],
    'financeiro.msg.dramatico.4': ['Seu extrato e o app estão brigando e eu estou no meio. Vem resolver isso!', 'Tu extracto y la app se están peleando y yo estoy en el medio. ¡Vení a resolverlo!', 'Your statement and the app are fighting and I\'m stuck in the middle. Come sort it out!'],
    'financeiro.msg.dramatico.5': ['Se o dinheiro falasse, ele já tinha te ligado. Registre pelo menos o maior gasto.', 'Si la plata hablara, ya te habría llamado. Registrá aunque sea el gasto más grande.', 'If money could talk, it would\'ve called you by now. Log at least the biggest expense.'],
    'financeiro.msg.dramatico.6': ['Já é meio de dia e {n} dias sem registrar. Meu coração financeiro não aguenta! 💔', 'Ya es mediodía y {n} días sin registrar. ¡Mi corazón financiero no aguanta! 💔', 'It\'s already midday and {n} days without logging. My financial heart can\'t take it! 💔'],
    'financeiro.msg.dramatico.7': ['Mandei mensagem de manhã e nada. {n} dias de silêncio... estou ficando sem desculpas por você. 😮‍💨', 'Mandé mensaje a la mañana y nada. {n} días de silencio... me estoy quedando sin excusas por vos. 😮‍💨', 'I messaged this morning and nothing. {n} days of silence... I\'m running out of excuses for you. 😮‍💨'],
    'financeiro.msg.dramatico.8': ['Plot twist: o dinheiro continua saindo e eu continuo sem saber. {n} dias! 🎬', 'Plot twist: la plata sigue saliendo y yo sigo sin saber. ¡{n} días! 🎬', 'Plot twist: the money keeps leaving and I still don\'t know. {n} days! 🎬'],
    'financeiro.msg.dramatico.9': ['Tentando de novo, porque desistir não é comigo. Registre ao menos um gasto de hoje!', 'Insisto de nuevo, porque rendirme no es lo mío. ¡Registrá al menos un gasto de hoy!', 'Trying again, because giving up isn\'t my thing. Log at least one expense from today!'],
    'financeiro.msg.dramatico.10': ['Seu orçamento está sozinho há {n} dias. Vá lá dar uma olhada nele! 🕯️', 'Tu presupuesto está solito hace {n} días. ¡Vení a darle una mirada! 🕯️', 'Your budget has been alone for {n} days. Come and check on it! 🕯️'],

    // ---- Tom 4: saudade (5 dias ou mais, mais leve) ----
    'financeiro.msg.saudade.1': ['Faz um tempinho que a gente não se fala. Quando quiser voltar, eu estou aqui. 💙', 'Hace un ratito que no hablamos. Cuando quieras volver, acá estoy. 💙', 'It\'s been a little while since we talked. Whenever you want to come back, I\'m here. 💙'],
    'financeiro.msg.saudade.2': ['Sem pressão: se quiser retomar, basta anotar um gasto. O resto a gente ajeita.', 'Sin presión: si querés retomar, alcanza con anotar un gasto. Lo demás lo arreglamos.', 'No pressure: if you want to start again, just log one expense. We\'ll sort out the rest.'],
    'financeiro.msg.saudade.3': ['Sentimos sua falta! Que tal começar de novo só com o de hoje?', '¡Te extrañamos! ¿Y si empezás de nuevo solo con lo de hoy?', 'We miss you! How about starting over with just today\'s?'],
    'financeiro.msg.saudade.4': ['A vida corre, eu sei. Quando der, volta aqui e a gente organiza tudo junto.', 'La vida corre, lo sé. Cuando puedas, volvé y organizamos todo juntos.', 'Life gets busy, I know. When you can, come back and we\'ll get it all organized together.'],
    'financeiro.msg.saudade.5': ['Seus números continuam guardadinhos esperando por você. Sem cobrança, tá?', 'Tus números siguen guardaditos esperándote. Sin cobranza, ¿dale?', 'Your numbers are still safe and waiting for you. No nagging, okay?'],
    'financeiro.msg.saudade.6': ['Passando de novo, sem pressão. Quando tiver um minutinho, a gente retoma. 💙', 'Paso de nuevo, sin presión. Cuando tengas un minutito, retomamos. 💙', 'Dropping by again, no pressure. When you have a minute, we\'ll pick it back up. 💙'],
    'financeiro.msg.saudade.7': ['Uma pausa no meio do dia pode ser um bom momento para voltar. Estou aqui.', 'Una pausa a mitad del día puede ser un buen momento para volver. Acá estoy.', 'A midday break can be a good moment to come back. I\'m here.'],
    'financeiro.msg.saudade.8': ['Sem cobrança: só um lembrete de que seus números continuam te esperando.', 'Sin cobranza: solo un recordatorio de que tus números siguen esperándote.', 'No nagging: just a reminder that your numbers are still waiting for you.'],
    'financeiro.msg.saudade.9': ['Que tal recomeçar com algo pequeno? Um gasto de hoje já basta.', '¿Y si empezás de nuevo con algo pequeño? Un gasto de hoy ya alcanza.', 'How about starting again with something small? One expense from today is enough.'],
    'financeiro.msg.saudade.10': ['Sempre bom ter você por aqui. Volta quando quiser, a casa é sua. 🏠', 'Siempre es bueno tenerte por acá. Volvé cuando quieras, la casa es tuya. 🏠', 'Always good to have you here. Come back whenever you like, the place is yours. 🏠'],

    // ---- Botoes da notificacao (curtos: o Android corta textos longos) ----
    'financeiro.acao_pausar': ['Não incomodar 7 dias', 'No molestar 7 días', 'Snooze 7 days'],
    'financeiro.acao_desativar': ['Não incomodar mais', 'No molestar más', 'Stop reminders'],

    // ---- Resposta ao tocar nos botoes da notificacao ----
    'financeiro.resp_pausado': ['Combinado! Fico quieto por 7 dias.', '¡Listo! Me quedo callado por 7 días.', 'Deal! I\'ll stay quiet for 7 days.'],
    'financeiro.resp_desativado': ['Tudo bem, não vou mais te cobrar. Para reativar: Configurações > Lembretes.', 'Está bien, no te voy a cobrar más. Para reactivar: Configuración > Recordatorios.', 'All good, no more nudges. To turn them back on: Settings > Reminders.'],
    'financeiro.resp_expirada': ['Esta opção expirou. Abra o app e ajuste em Configurações > Lembretes.', 'Esta opción venció. Abrí la app y ajustá en Configuración > Recordatorios.', 'This option has expired. Open the app and adjust it in Settings > Reminders.'],

    // ---- Tela aberta ao tocar na notificacao ----
    'financeiro.pagina_titulo': ['Financeiro', 'Financiero', 'Mr. Finance'],
    'financeiro.pagina_sem_msg': ['Eu cuido de te lembrar de registrar seus gastos quando você fica um tempo sem passar por aqui.', 'Me encargo de recordarte que registres tus gastos cuando pasás un tiempo sin entrar.', 'I\'ll remind you to log your spending whenever you spend a while away from the app.'],
    'financeiro.registrar_agora': ['Registrar um gasto agora', 'Registrar un gasto ahora', 'Log an expense now'],
    'financeiro.btn_pausar': ['Não incomodar por 7 dias', 'No molestar por 7 días', 'Don\'t disturb for 7 days'],
    'financeiro.btn_desativar': ['Não incomodar mais', 'No molestar más', 'Stop reminders'],
    'financeiro.btn_retomar': ['Retomar agora', 'Retomar ahora', 'Resume now'],
    'financeiro.btn_ativar': ['Reativar o Financeiro', 'Reactivar a Financiero', 'Turn Mr. Finance back on'],
    'financeiro.estado_pausado': ['Em pausa até {data}.', 'En pausa hasta el {data}.', 'Paused until {data}.'],
    'financeiro.estado_desativado': ['As cobranças por inatividade estão desativadas.', 'Los cobros por inactividad están desactivados.', 'Inactivity nudges are turned off.'],

    // ---- Configuracoes > Lembretes ----
    'financeiro.cfg_titulo': ['Financeiro: cobranças por inatividade', 'Financiero: cobros por inactividad', 'Mr. Finance: inactivity nudges'],
    'financeiro.cfg_texto': ['Se você passa um tempo sem registrar nada, o Financeiro manda uma notificação (no máximo duas por dia: às 8h e às 13h) para te lembrar. O tom muda conforme os dias passam.', 'Si pasás un tiempo sin registrar nada, Financiero te manda una notificación (como máximo dos por día: a las 8 h y a las 13 h) para recordártelo. El tono cambia a medida que pasan los días.', 'If you go a while without logging anything, Mr. Finance sends a notification (at most two a day: at 8 am and 1 pm) to remind you. The tone changes as the days go by.'],
    'financeiro.cfg_desativar': ['Desativar cobranças por inatividade', 'Desactivar cobros por inactividad', 'Turn off inactivity nudges'],
    'financeiro.cfg_ativar': ['Ativar cobranças por inatividade', 'Activar cobros por inactividad', 'Turn on inactivity nudges'],
    'financeiro.cfg_precisa_aparelho': ['As cobranças só chegam em aparelhos com as notificações ativadas (veja acima).', 'Los cobros solo llegan a dispositivos con las notificaciones activadas (mirá arriba).', 'Nudges only reach devices with notifications enabled (see above).'],

    // ---- Teste (fase de testes: so admin) ----
    'financeiro.teste_titulo': ['Testar as notificações', 'Probar las notificaciones', 'Test the notifications'],
    'financeiro.teste_texto': ['Envia agora, para os seus aparelhos, um exemplo de cada tom. Os botões da notificação funcionam de verdade (pausar ou desativar).', 'Envía ahora, a tus dispositivos, un ejemplo de cada tono. Los botones de la notificación funcionan de verdad (pausar o desactivar).', 'Sends an example of each tone to your devices right now. The notification buttons really work (snooze or turn off).'],
    'financeiro.tom_brincalhao': ['Brincalhão', 'Bromista', 'Playful'],
    'financeiro.tom_cobrando': ['Cobrando', 'Cobrando', 'Nagging'],
    'financeiro.tom_dramatico': ['Dramático', 'Dramático', 'Dramatic'],
    'financeiro.tom_saudade': ['Saudade', 'Nostalgia', 'Missing you'],
    'financeiro.teste_enviado': ['Exemplo enviado. Se não aparecer em alguns segundos, verifique as permissões do navegador.', 'Ejemplo enviado. Si no aparece en unos segundos, revisá los permisos del navegador.', 'Example sent. If it does not show up in a few seconds, check the browser permissions.'],

    // ---- Teste "verificar inatividade agora" (so admin) ----
    'financeiro.verif_btn': ['Verificar inatividade agora', 'Verificar inactividad ahora', 'Check inactivity now'],
    'financeiro.verif_texto': ['Roda agora a mesma checagem das 8h e 13h com os seus dados reais (dias sem registrar, pausa e aparelhos) e diz se enviaria a notificação ou por que não.', 'Corre ahora la misma verificación de las 8 h y 13 h con tus datos reales (días sin registrar, pausa y dispositivos) y te dice si enviaría la notificación o por qué no.', 'Runs the same 8 am / 1 pm check right now with your real data (days without logging, pause and devices) and tells you whether it would send the notification, or why not.'],
    'financeiro.verif_enviado': ['Enviado! Você está há {n} dia(s) sem registrar, então o Financeiro mandou a notificação.', '¡Enviado! Llevás {n} día(s) sin registrar, por eso Financiero mandó la notificación.', 'Sent! You are {n} day(s) without logging, so Mr. Finance sent the notification.'],
    'financeiro.verif_falha': ['A notificação deveria sair ({n} dia(s) sem registrar), mas não foi entregue. Confira as permissões de notificação do aparelho.', 'La notificación debía salir ({n} día(s) sin registrar), pero no se entregó. Revisá los permisos de notificación del dispositivo.', 'The notification should go out ({n} day(s) without logging) but was not delivered. Check the device notification permissions.'],
    'financeiro.verif_registrou_hoje': ['Nada enviado: você registrou algo hoje. Para testar, use os exemplos acima ou espere ficar um dia sem registrar.', 'No se envió nada: registraste algo hoy. Para probar, usá los ejemplos de arriba o esperá a pasar un día sin registrar.', 'Nothing sent: you logged something today. To test, use the examples above or wait until you go a day without logging.'],
    'financeiro.verif_fora_do_dia': ['Nada enviado: são {n} dia(s) sem registrar, mas hoje não é dia de envio (depois do 4º dia só nos dias 5, 7, 14, 21 e 28; passado um mês, para).', 'No se envió nada: son {n} día(s) sin registrar, pero hoy no toca enviar (después del 4.º día solo los días 5, 7, 14, 21 y 28; pasado un mes, se detiene).', 'Nothing sent: {n} day(s) without logging, but today is not a send day (after day 4 only on days 5, 7, 14, 21 and 28; after a month it stops).'],
    'financeiro.verif_desativado': ['Nada enviado: o Financeiro está desativado na sua conta.', 'No se envió nada: Financiero está desactivado en tu cuenta.', 'Nothing sent: Mr. Finance is turned off on your account.'],
    'financeiro.verif_pausado': ['Nada enviado: o Financeiro está em pausa. Toque em "Retomar agora" para testar.', 'No se envió nada: Financiero está en pausa. Tocá "Retomar ahora" para probar.', 'Nothing sent: Mr. Finance is paused. Tap "Resume now" to test.'],
    'financeiro.verif_sem_aparelho': ['Nada enviado: nenhum aparelho com notificações ativadas nesta conta.', 'No se envió nada: ningún dispositivo con notificaciones activadas en esta cuenta.', 'Nothing sent: no device with notifications enabled on this account.'],
    'financeiro.verif_plano': ['Nada enviado: a conta está sem plano ativo (bloqueada ou somente leitura).', 'No se envió nada: la cuenta no tiene plan activo (bloqueada o solo lectura).', 'Nothing sent: the account has no active plan (blocked or read-only).'],
    'financeiro.verif_sem_config': ['Nada enviado: o Financeiro ainda não foi configurado para esta conta. Ative as notificações e o Financeiro acima.', 'No se envió nada: Financiero aún no está configurado para esta cuenta. Activá las notificaciones y Financiero arriba.', 'Nothing sent: Mr. Finance is not set up for this account yet. Turn on notifications and Mr. Finance above.'],

    // ---- Avisos apos mudar a configuracao ----
    'financeiro.flash_pausado': ['Combinado! O Financeiro fica quieto por 7 dias.', '¡Listo! Financiero se queda callado por 7 días.', 'Deal! Mr. Finance will stay quiet for 7 days.'],
    'financeiro.flash_desativado': ['Cobranças por inatividade desativadas. Você pode ativar de novo em Configurações > Lembretes.', 'Cobros por inactividad desactivados. Podés activarlos de nuevo en Configuración > Recordatorios.', 'Inactivity nudges turned off. You can turn them back on in Settings > Reminders.'],
    'financeiro.flash_ativado': ['Cobranças por inatividade ativadas.', 'Cobros por inactividad activados.', 'Inactivity nudges turned on.'],
    'financeiro.flash_retomado': ['O Financeiro voltou a funcionar.', 'Financiero volvió a funcionar.', 'Mr. Finance is back on duty.']
};
