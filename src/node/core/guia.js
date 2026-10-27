// Guia de uso: um mes de uma pessoa comum (Marina) usando o app, passo a passo.
// Cada texto e [pt-BR, es-PY, en-US]. Marcacao simples: **negrito** e *italico* (o resto e escapado na tela).
// Os nomes de botoes e telas seguem exatamente o que aparece no app em cada idioma.
const s = (pt, es, en) => [pt, es, en];

const SECOES = [
    {
        id: 'conta', icone: 'ph-bank', link: { href: '/contas', rot: s('Abrir Contas Bancárias', 'Abrir Cuentas Bancarias', 'Open Bank Accounts') },
        titulo: s('1. Criar a conta onde o dinheiro está', '1. Crear la cuenta donde está el dinero', '1. Create the account where your money is'),
        intro: s('Todo recebimento e todo gasto pertence a uma conta (Carteira, Banco, Poupança...). A Marina começa com duas.',
            'Todo ingreso y todo gasto pertenece a una cuenta (Billetera, Banco, Ahorro...). Marina empieza con dos.',
            'Every income and every expense belongs to an account (Wallet, Bank, Savings...). Marina starts with two.'),
        passos: [
            s('Abra **Contas Bancárias** e toque em **+ Adicionar conta**.', 'Abrí **Cuentas Bancarias** y tocá **+ Agregar cuenta**.', 'Open **Bank Accounts** and tap **+ Add account**.'),
            s('Crie **Banco Itaú** com saldo inicial de **Gs. 2.000.000** e **Carteira** com **Gs. 150.000**.', 'Creá **Banco Itaú** con saldo inicial de **Gs. 2.000.000** y **Billetera** con **Gs. 150.000**.', 'Create **Banco Itaú** with an opening balance of **Gs. 2,000,000** and **Wallet** with **Gs. 150,000**.'),
            s('A conta marcada como **padrão** já vem escolhida nos formulários, para você digitar menos.', 'La cuenta marcada como **predeterminada** ya viene elegida en los formularios, para que escribas menos.', 'The account marked as **default** comes pre-selected in the forms, so you type less.')
        ],
        dica: s('O saldo inicial é só o que você tem hoje; o app soma e subtrai os lançamentos a partir daí. Se um dia o saldo do app não bater com o do banco, use **Ajustar saldo** na conta. O número de contas depende do plano: até 2 no Básico, 4 no Premium e ilimitadas no Pro.',
            'El saldo inicial es solo lo que tenés hoy; la app suma y resta los movimientos desde ahí. Si algún día el saldo de la app no coincide con el del banco, usá **Ajustar saldo** en la cuenta. La cantidad de cuentas depende del plan: hasta 2 en el Básico, 4 en el Premium e ilimitadas en el Pro.',
            'The opening balance is only what you have today; the app adds and subtracts entries from there. If the app balance ever differs from your bank, use **Adjust balance** on the account. The number of accounts depends on the plan: up to 2 on Basic, 4 on Premium and unlimited on Pro.')
    },
    {
        id: 'receita', icone: 'ph-arrow-circle-up',
        titulo: s('2. Registrar um recebimento', '2. Registrar un ingreso', '2. Record income'),
        intro: s('A Marina fez um trabalho extra e recebeu hoje Gs. 800.000.', 'Marina hizo un trabajo extra y cobró hoy Gs. 800.000.', 'Marina did a side job and was paid Gs. 800,000 today.'),
        passos: [
            s('No **Início**, toque em **Receita**. No celular, toque no **+** da barra de baixo e escolha **Receita**.', 'En **Inicio**, tocá **Ingreso**. En el celular, tocá el **+** de la barra de abajo y elegí **Ingreso**.', 'On **Home**, tap **Income**. On your phone, tap the **+** in the bottom bar and choose **Income**.'),
            s('Preencha a descrição **Trabalho extra**, o valor **800.000**, a categoria **Renda extra** e a conta **Banco Itaú**.', 'Completá la descripción **Trabajo extra**, el valor **800.000**, la categoría **Ingreso extra** y la cuenta **Banco Itaú**.', 'Fill in the description **Side job**, the amount **800,000**, the category **Extra income** and the account **Banco Itaú**.'),
            s('Ligue **Foi Recebida** e confira a data. Pronto: o dinheiro entra no saldo da conta na hora.', 'Activá **Fue Recibido** y revisá la fecha. Listo: el dinero entra en el saldo de la cuenta al instante.', 'Turn on **Was Received** and check the date. Done: the money goes into the account balance right away.'),
            s('Se o dinheiro **ainda não chegou**, deixe **Foi Recebida** desligada e escolha a data prevista. O lançamento fica **pendente** e não mexe no saldo até você marcar como recebido.', 'Si el dinero **todavía no llegó**, dejá **Fue Recibido** apagado y elegí la fecha prevista. El movimiento queda **pendiente** y no cambia el saldo hasta que lo marques como cobrado.', 'If the money **has not arrived yet**, leave **Was Received** off and pick the expected date. The entry stays **pending** and does not change the balance until you mark it as received.')
        ],
        exemplo: [{ tipo: 'rec', rot: s('Trabalho extra · recebido', 'Trabajo extra · cobrado', 'Side job · received'), val: '+ Gs. 800.000' }],
        dica: s('A categoria é obrigatória e a subcategoria é opcional. Não achou a categoria? Crie na hora pelo seletor, sem sair do formulário.', 'La categoría es obligatoria y la subcategoría es opcional. ¿No encontrás la categoría? Creala en el momento desde el selector, sin salir del formulario.', 'The category is required and the subcategory is optional. Cannot find the category? Create it on the spot from the selector, without leaving the form.')
    },
    {
        id: 'receita-parcelas', icone: 'ph-arrows-clockwise',
        titulo: s('3. Um recebimento em 2 parcelas', '3. Un ingreso en 2 cuotas', '3. Income in 2 installments'),
        intro: s('A Marina vendeu um notebook usado por Gs. 1.500.000 e o comprador paga em 2 vezes.', 'Marina vendió una notebook usada por Gs. 1.500.000 y el comprador paga en 2 veces.', 'Marina sold a used laptop for Gs. 1,500,000 and the buyer pays in 2 installments.'),
        passos: [
            s('Abra **Receita**, descrição **Venda do notebook**, categoria **Renda extra**.', 'Abrí **Ingreso**, descripción **Venta de la notebook**, categoría **Ingreso extra**.', 'Open **Income**, description **Laptop sale**, category **Extra income**.'),
            s('Em valor, coloque **o valor de cada parcela: 750.000**. O app repete esse mesmo valor em cada mês; ele não divide o total sozinho.', 'En valor, poné **el valor de cada cuota: 750.000**. La app repite ese mismo valor cada mes; no divide el total por su cuenta.', 'For the amount, enter **the value of each installment: 750,000**. The app repeats that same amount every month; it does not split the total by itself.'),
            s('Ligue **Repetir Lançamento** e coloque **2**. Ele cria uma parcela por mês: a primeira na data escolhida e a seguinte um mês depois. Em **Repetir a cada** você pode trocar o mês por 3 meses, 6 meses ou ano, para cobranças como uma licença anual.', 'Activá **Repetir Movimiento** y poné **2**. Crea una cuota por mes: la primera en la fecha elegida y la siguiente un mes después. En **Repetir cada** podés cambiar el mes por 3 meses, 6 meses o año, para cobros como una licencia anual.', 'Turn on **Repeat Entry** and enter **2**. It creates one installment per month: the first on the chosen date and the next one a month later. Under **Repeat every** you can switch the month to 3 months, 6 months or a year, for charges like an annual license.'),
            s('Na lista aparecem **Venda do notebook 1/2** e **2/2**, as duas **pendentes** até serem recebidas.', 'En la lista aparecen **Venta de la notebook 1/2** y **2/2**, las dos **pendientes** hasta cobrarlas.', 'The list shows **Laptop sale 1/2** and **2/2**, both **pending** until received.')
        ],
        exemplo: [
            { tipo: 'rec', rot: s('Venda do notebook 1/2 · pendente', 'Venta de la notebook 1/2 · pendiente', 'Laptop sale 1/2 · pending'), val: '+ Gs. 750.000' },
            { tipo: 'rec', rot: s('Venda do notebook 2/2 · pendente', 'Venta de la notebook 2/2 · pendiente', 'Laptop sale 2/2 · pending'), val: '+ Gs. 750.000' }
        ],
        dica: s('Ao editar uma parcela o app pergunta: **Apenas Este Lançamento**, **Esta e as Próximas** ou **Toda a Série**. Assim você corrige só uma parcela ou todas de uma vez.', 'Al editar una cuota la app pregunta: **Solo Este Movimiento**, **Esta y las Siguientes** o **Toda la Serie**. Así corregís solo una cuota o todas de una vez.', 'When you edit an installment the app asks: **Only This Entry**, **This and the Next Ones** or **The Whole Series**. That way you fix just one installment or all of them at once.')
    },
    {
        id: 'receita-fixa', icone: 'ph-push-pin',
        titulo: s('4. Um recebimento fixo todo mês', '4. Un ingreso fijo cada mes', '4. A fixed monthly income'),
        intro: s('O salário da Marina é Gs. 4.000.000, todo dia 5.', 'El salario de Marina es Gs. 4.000.000, todos los días 5.', 'Marina\'s salary is Gs. 4,000,000, every 5th.'),
        passos: [
            s('Abra **Receita**: descrição **Salário**, valor **4.000.000**, categoria **Salário**, data **dia 5 deste mês**.', 'Abrí **Ingreso**: descripción **Salario**, valor **4.000.000**, categoría **Salario**, fecha **día 5 de este mes**.', 'Open **Income**: description **Salary**, amount **4,000,000**, category **Salary**, date **the 5th of this month**.'),
            s('Ligue **Receita Fixa**. O app cria os próximos **24 meses** como pendentes, um por mês.', 'Activá **Ingreso Fijo**. La app crea los próximos **24 meses** como pendientes, uno por mes.', 'Turn on **Recurring Income**. The app creates the next **24 months** as pending, one per month.'),
            s('Todo mês, quando o salário cair, toque em **Receber** no lançamento daquele mês. Os meses seguintes continuam pendentes.', 'Cada mes, cuando caiga el salario, tocá **Cobrar** en el movimiento de ese mes. Los meses siguientes siguen pendientes.', 'Each month, when the salary arrives, tap **Receive** on that month\'s entry. The following months stay pending.'),
            s('Se o salário aumentar, edite o lançamento e escolha **Esta e as Próximas**. Os meses anteriores ficam como estavam.', 'Si el salario aumenta, editá el movimiento y elegí **Esta y las Siguientes**. Los meses anteriores quedan como estaban.', 'If the salary goes up, edit the entry and choose **This and the Next Ones**. Earlier months stay as they were.')
        ],
        exemplo: [{ tipo: 'rec', rot: s('Salário · todo dia 5 (24 meses)', 'Salario · cada día 5 (24 meses)', 'Salary · every 5th (24 months)'), val: '+ Gs. 4.000.000' }],
        dica: s('Use **fixo** para o que se repete sem data para acabar (salário, aluguel, internet) e **repetir** para um número fechado de meses (uma compra em 6 vezes).', 'Usá **fijo** para lo que se repite sin fecha de fin (salario, alquiler, internet) y **repetir** para una cantidad cerrada de meses (una compra en 6 cuotas).', 'Use **recurring** for what repeats with no end date (salary, rent, internet) and **repeat** for a fixed number of months (a purchase in 6 installments).')
    },
    {
        id: 'despesas', icone: 'ph-arrow-circle-down',
        titulo: s('5. O mesmo para os gastos', '5. Lo mismo para los gastos', '5. The same for expenses'),
        intro: s('Gastos funcionam exatamente igual, com o botão **Despesa**. A Marina registra três tipos:', 'Los gastos funcionan exactamente igual, con el botón **Gasto**. Marina registra tres tipos:', 'Expenses work exactly the same way, with the **Expense** button. Marina records three kinds:'),
        passos: [
            s('**Avulso:** Supermercado, **Gs. 350.000**, categoria Alimentação, subcategoria Mercado. Já pagou? Ligue **Foi Pago**.', '**Suelto:** Supermercado, **Gs. 350.000**, categoría Alimentación, subcategoría Mercado. ¿Ya pagó? Activá **Fue Pagado**.', '**One-off:** Groceries, **Gs. 350,000**, category Food, subcategory Groceries. Already paid? Turn on **Was Paid**.'),
            s('**Parcelado:** a geladeira em 6 vezes. Valor de cada parcela **400.000**, **Repetir Lançamento** com **6**. Aparecem **Geladeira 1/6** até **6/6**.', '**En cuotas:** la heladera en 6 veces. Valor de cada cuota **400.000**, **Repetir Movimiento** con **6**. Aparecen **Heladera 1/6** hasta **6/6**.', '**Installments:** the fridge in 6 payments. Amount of each installment **400,000**, **Repeat Entry** with **6**. You get **Fridge 1/6** to **6/6**.'),
            s('**Fixo:** Aluguel **1.500.000** e Internet **150.000**, com **Despesa Fixa** ligada. Todo mês é só tocar em **Pagar**.', '**Fijo:** Alquiler **1.500.000** e Internet **150.000**, con **Gasto Fijo** activado. Cada mes solo tocás **Pagar**.', '**Recurring:** Rent **1,500,000** and Internet **150,000**, with **Recurring Expense** on. Each month you just tap **Pay**.'),
            s('Gastou e esqueceu de lançar? Sem problema: registre depois, com a data em que o gasto aconteceu.', '¿Gastaste y te olvidaste de cargarlo? No hay problema: registralo después, con la fecha en que ocurrió el gasto.', 'Spent something and forgot to record it? No problem: record it later, using the date the expense happened.')
        ],
        exemplo: [
            { tipo: 'des', rot: s('Supermercado · pago', 'Supermercado · pagado', 'Groceries · paid'), val: '- Gs. 350.000' },
            { tipo: 'des', rot: s('Geladeira 1/6 · pendente', 'Heladera 1/6 · pendiente', 'Fridge 1/6 · pending'), val: '- Gs. 400.000' },
            { tipo: 'des', rot: s('Aluguel · fixo, pendente', 'Alquiler · fijo, pendiente', 'Rent · recurring, pending'), val: '- Gs. 1.500.000' }
        ]
    },
    {
        id: 'categorias', icone: 'ph-tag', link: { href: '/categorias', rot: s('Abrir Categorias', 'Abrir Categorías', 'Open Categories') },
        titulo: s('6. Categorias e subcategorias', '6. Categorías y subcategorías', '6. Categories and subcategories'),
        intro: s('O app já vem com categorias prontas. A Marina ajusta as dela para saber para onde o dinheiro vai.', 'La app ya viene con categorías listas. Marina ajusta las suyas para saber a dónde va el dinero.', 'The app comes with ready-made categories. Marina tweaks hers to see where the money goes.'),
        passos: [
            s('Abra **Categorias** e toque em **+ Adicionar categoria**: **Moradia**, **Alimentação**, **Transporte**, **Lazer**.', 'Abrí **Categorías** y tocá **+ Agregar categoría**: **Vivienda**, **Alimentación**, **Transporte**, **Ocio**.', 'Open **Categories** and tap **+ Add category**: **Housing**, **Food**, **Transport**, **Leisure**.'),
            s('Para criar uma **subcategoria**, toque no **+** ao lado da categoria. Em Moradia: **Aluguel**, **Energia elétrica**, **Internet**. Em Alimentação: **Mercado**, **Restaurantes**.', 'Para crear una **subcategoría**, tocá el **+** al lado de la categoría. En Vivienda: **Alquiler**, **Energía eléctrica**, **Internet**. En Alimentación: **Mercado**, **Restaurantes**.', 'To create a **subcategory**, tap the **+** next to the category. Under Housing: **Rent**, **Electricity**, **Internet**. Under Food: **Groceries**, **Restaurants**.'),
            s('Escolha uma **cor** para cada categoria: é a cor que aparece nos gráficos.', 'Elegí un **color** para cada categoría: es el color que aparece en los gráficos.', 'Pick a **color** for each category: it is the color used in the charts.'),
            s('Na hora de lançar, escolha a categoria e depois a subcategoria.', 'Al cargar un movimiento, elegí la categoría y después la subcategoría.', 'When recording an entry, choose the category and then the subcategory.'),
            s('**Premium:** defina um **limite mensal** (orçamento) na categoria, por exemplo Alimentação **Gs. 1.200.000**. Os relatórios mostram quanto do limite já foi usado.', '**Premium:** definí un **límite mensual** (presupuesto) en la categoría, por ejemplo Alimentación **Gs. 1.200.000**. Los informes muestran cuánto del límite ya se usó.', '**Premium:** set a **monthly limit** (budget) on the category, for example Food **Gs. 1,200,000**. The reports show how much of the limit has been used.')
        ],
        dica: s('Menos é mais: de 8 a 12 categorias bastam. Use subcategorias para detalhar, em vez de criar categorias demais.', 'Menos es más: de 8 a 12 categorías alcanzan. Usá subcategorías para detallar, en vez de crear demasiadas categorías.', 'Less is more: 8 to 12 categories are enough. Use subcategories to add detail instead of creating too many categories.')
    },
    {
        id: 'gastos', icone: 'ph-chart-pie-slice', link: { href: '/relatorios', rot: s('Abrir Relatórios', 'Abrir Informes', 'Open Reports') },
        titulo: s('7. Ver em que o dinheiro está indo', '7. Ver en qué se va el dinero', '7. See where your money is going'),
        intro: s('Depois de alguns dias de lançamentos, a Marina quer saber onde mais gasta.', 'Después de algunos días de movimientos, Marina quiere saber en qué gasta más.', 'After a few days of entries, Marina wants to know where she spends the most.'),
        passos: [
            s('Abra **Relatórios › Gráficos**. Os gráficos mostram **Receitas** e **Despesas** por **categoria** e por **subcategoria** no período escolhido.', 'Abrí **Informes › Gráficos**. Los gráficos muestran **Ingresos** y **Gastos** por **categoría** y por **subcategoría** en el período elegido.', 'Open **Reports › Charts**. The charts show **Income** and **Expenses** by **category** and by **subcategory** for the chosen period.'),
            s('Mude o período com as setas do mês ou com **Hoje**, **7 Dias**, **Anual** e **Período personalizado**.', 'Cambiá el período con las flechas del mes o con **Hoy**, **7 Días**, **Anual** y **Período personalizado**.', 'Change the period with the month arrows or with **Today**, **7 Days**, **Yearly** and **Custom period**.'),
            s('Em cada gráfico, o filtro **Todos / Pagos / Pendentes** separa o que já saiu do que ainda vai sair.', 'En cada gráfico, el filtro **Todos / Pagados / Pendientes** separa lo que ya salió de lo que todavía va a salir.', 'On each chart, the **All / Paid / Pending** filter separates what already went out from what is still to go.'),
            s('Toque em **Ver todas as categorias** para abrir a lista de lançamentos de cada uma.', 'Tocá **Ver todas las categorías** para abrir la lista de movimientos de cada una.', 'Tap **View all categories** to open the list of entries for each one.'),
            s('Mais abaixo estão a **evolução do saldo** e a **frequência diária** de lançamentos.', 'Más abajo están la **evolución del saldo** y la **frecuencia diaria** de movimientos.', 'Further down are the **balance trend** and the **daily frequency** of entries.'),
            s('**Anual:** tabela mês a mês de cada categoria do ano. Toque na categoria para ver as subcategorias.', '**Anual:** tabla mes a mes de cada categoría del año. Tocá la categoría para ver las subcategorías.', '**Annual:** a month-by-month table of each category for the year. Tap a category to see its subcategories.'),
            s('**Premium:** a aba **Demonstrativo** mostra o resultado do período, cada categoria com o que já foi pago, o que falta, o peso no total e a variação contra o período anterior.', '**Premium:** la pestaña **Estado financiero** muestra el resultado del período, cada categoría con lo ya pagado, lo pendiente, el peso en el total y la variación frente al período anterior.', '**Premium:** the **Statement** tab shows the period result, each category with what was paid, what is pending, its share of the total and the change versus the previous period.'),
            s('**Pro:** o **Fluxo de caixa** projeta o saldo dia a dia, a visão **Por conta** separa cada conta e dá para comparar com o ano passado.', '**Pro:** el **Flujo de caja** proyecta el saldo día a día, la vista **Por cuenta** separa cada cuenta y se puede comparar con el año pasado.', '**Pro:** the **Cash flow** projects the balance day by day, the **By account** view splits each account and you can compare with last year.')
        ],
        dica: s('Uma boa pergunta para fazer aos gráficos: "qual categoria cresceu mais que no mês passado?". É por ali que se começa a economizar.', 'Una buena pregunta para hacerle a los gráficos: "¿qué categoría creció más que el mes pasado?". Por ahí se empieza a ahorrar.', 'A good question to ask the charts: "which category grew the most compared with last month?". That is where saving starts.')
    },
    {
        id: 'pendencias', icone: 'ph-clock-countdown', link: { href: '/relatorios?aba=pendentes&preset=7dias', rot: s('Abrir Pendentes (próximos 7 dias)', 'Abrir Pendientes (próximos 7 días)', 'Open Pending (next 7 days)') },
        titulo: s('8. O que pagar e o que receber', '8. Qué pagar y qué cobrar', '8. What to pay and what to receive'),
        intro: s('A Marina quer abrir o app e saber, em segundos, o que precisa fazer.', 'Marina quiere abrir la app y saber, en segundos, qué tiene que hacer.', 'Marina wants to open the app and know, in seconds, what she needs to do.'),
        passos: [
            s('No **Início**, o bloco **Vencidas ou de hoje** mostra o que pede atenção agora, com o botão **Pagar** ou **Receber** em cada item.', 'En **Inicio**, el bloque **Vencidas o de hoy** muestra lo que pide atención ahora, con el botón **Pagar** o **Cobrar** en cada ítem.', 'On **Home**, the **Overdue or due today** block shows what needs attention now, with a **Pay** or **Receive** button on each item.'),
            s('Para olhar à frente, abra **Relatórios › Pendentes** e toque em **Próximos 7 Dias**: tudo que vence na semana, a pagar e a receber.', 'Para mirar hacia adelante, abrí **Informes › Pendientes** y tocá **Próximos 7 Días**: todo lo que vence en la semana, a pagar y a cobrar.', 'To look ahead, open **Reports › Pending** and tap **Next 7 Days**: everything due this week, to pay and to receive.'),
            s('Toque em **Este Mês** para ver tudo que ainda falta pagar ou receber até o fim do mês.', 'Tocá **Este Mes** para ver todo lo que todavía falta pagar o cobrar hasta fin de mes.', 'Tap **This Month** to see everything still to pay or receive until the end of the month.'),
            s('Toque em **Pagar** (ou **Receber**) para dar baixa: o saldo da conta atualiza na hora. Marcou sem querer? No menu **⋮** do lançamento, escolha **Desfazer pagamento**.', 'Tocá **Pagar** (o **Cobrar**) para dar de baja: el saldo de la cuenta se actualiza al instante. ¿Lo marcaste sin querer? En el menú **⋮** del movimiento, elegí **Deshacer pago**.', 'Tap **Pay** (or **Receive**) to settle it: the account balance updates right away. Marked by mistake? In the entry\'s **⋮** menu, choose **Undo payment**.'),
            s('O **Saldo Previsto (após pendências)** no Início mostra quanto vai sobrar se tudo que está pendente for pago e recebido.', 'El **Saldo Previsto (tras pendientes)** en Inicio muestra cuánto va a sobrar si todo lo pendiente se paga y se cobra.', 'The **Projected Balance (after pending items)** on Home shows what will be left if everything pending is paid and received.'),
            s('Para não esquecer nenhum vencimento, ligue os **Lembretes** em **Configurações**: o app avisa no celular.', 'Para no olvidar ningún vencimiento, activá los **Recordatorios** en **Configuración**: la app avisa en el celular.', 'To never miss a due date, turn on **Reminders** in **Settings**: the app notifies you on your phone.')
        ],
        exemplo: [
            { tipo: 'des', rot: s('Internet · vence hoje', 'Internet · vence hoy', 'Internet · due today'), val: '- Gs. 150.000' },
            { tipo: 'des', rot: s('Aluguel · vence em 4 dias', 'Alquiler · vence en 4 días', 'Rent · due in 4 days'), val: '- Gs. 1.500.000' },
            { tipo: 'rec', rot: s('Salário · vence em 6 dias', 'Salario · vence en 6 días', 'Salary · due in 6 days'), val: '+ Gs. 4.000.000' }
        ]
    },
    {
        id: 'contas-extras', icone: 'ph-arrows-left-right', link: { href: '/contas', rot: s('Abrir Contas Bancárias', 'Abrir Cuentas Bancarias', 'Open Bank Accounts') },
        titulo: s('9. Mover dinheiro entre contas e conferir saldos', '9. Mover dinero entre cuentas y controlar saldos', '9. Move money between accounts and check balances'),
        intro: s('Nem todo movimento é receita ou despesa: às vezes é só passar dinheiro de um lugar para outro.', 'No todo movimiento es ingreso o gasto: a veces es solo pasar dinero de un lugar a otro.', 'Not every movement is income or an expense: sometimes you are just moving money from one place to another.'),
        passos: [
            s('Em **Contas Bancárias**, toque em **Transferir**: a Marina passa **Gs. 500.000** do Banco Itaú para a Carteira. Isso não conta como receita nem despesa.', 'En **Cuentas Bancarias**, tocá **Transferir**: Marina pasa **Gs. 500.000** del Banco Itaú a la Billetera. Eso no cuenta como ingreso ni gasto.', 'In **Bank Accounts**, tap **Transfer**: Marina moves **Gs. 500,000** from Banco Itaú to the Wallet. This does not count as income or an expense.'),
            s('Com **Agendar transferência** ela programa uma transferência futura, que pode se repetir todo mês (por exemplo, para uma reserva).', 'Con **Agendar transferencia** programa una transferencia futura, que puede repetirse cada mes (por ejemplo, para un ahorro).', 'With **Schedule transfer** she sets up a future transfer that can repeat every month (for example, into savings).'),
            s('Tem conta em **dólar ou real**? Cada conta tem a sua moeda, escolhida ao criá-la. Ao transferir entre moedas diferentes, o sistema pede a **cotação**: a Marina troca **Gs. 1.200.000** por reais a **1.190** e recebe **R$ 1.008,40** (valor ÷ cotação). Se o banco arredondar, digite o valor que entrou de fato e a cotação se ajusta.', '¿Tenés una cuenta en **dólares o reales**? Cada cuenta tiene su moneda, elegida al crearla. Al transferir entre monedas distintas, el sistema pide la **cotización**: Marina cambia **Gs. 1.200.000** por reales a **1.190** y recibe **R$ 1.008,40** (valor ÷ cotización). Si el banco redondea, escribí el valor que realmente entró y la cotización se ajusta.', 'Have an account in **dollars or reais**? Each account has its own currency, chosen when it is created. When you transfer between different currencies the system asks for the **exchange rate**: Marina swaps **Gs. 1,200,000** for reais at **1,190** and receives **R$ 1,008.40** (amount ÷ rate). If the bank rounds, type the amount that actually arrived and the rate adjusts.'),
            s('O **Extrato** de cada conta lista todos os lançamentos dela, com o saldo.', 'El **Extracto** de cada cuenta lista todos sus movimientos, con el saldo.', 'Each account\'s **Statement** lists all of its entries, with the balance.'),
            s('No Início e nos Relatórios, com contas em mais de uma moeda, aparece **Ver valores em**: cada moeda é mostrada separada, porque moedas diferentes não se somam.', 'En Inicio e Informes, con cuentas en más de una moneda, aparece **Ver valores en**: cada moneda se muestra por separado, porque las monedas distintas no se suman.', 'On Home and Reports, with accounts in more than one currency, **Show amounts in** appears: each currency is shown separately, because different currencies are never added together.'),
            s('Toque no ícone do **olho** para esconder os valores quando estiver em público.', 'Tocá el ícono del **ojo** para ocultar los valores cuando estés en público.', 'Tap the **eye** icon to hide the amounts when you are in public.')
        ]
    },
    {
        id: 'cartoes', icone: 'ph-credit-card', link: { href: '/cartoes', rot: s('Abrir Cartões', 'Abrir Tarjetas', 'Open Cards') },
        titulo: s('10. Cartão de crédito e fatura', '10. Tarjeta de crédito y factura', '10. Credit card and statement'),
        intro: s('A Marina usa um cartão de crédito. Comprar no cartão não tira dinheiro da conta na hora: o gasto vai para a **fatura** e o saldo só cai quando ela paga.',
            'Marina usa una tarjeta de crédito. Comprar con la tarjeta no saca dinero de la cuenta en el momento: el gasto va a la **factura** y el saldo solo baja cuando ella la paga.',
            'Marina uses a credit card. Buying on the card does not take money from the account right away: the spending goes on the **statement** and the balance only drops when she pays it.'),
        passos: [
            s('Abra **Cartões** (no celular, **Mais › Cartões**) e toque em **Adicionar cartão**. Nome **Visa Itaú**, conta **Banco Itaú** (é dela que sai o pagamento da fatura e vem a moeda do cartão), limite **Gs. 2.000.000**, fecha dia **10** e vence dia **20**.',
                'Abrí **Tarjetas** (en el celular, **Más › Tarjetas**) y tocá **Agregar tarjeta**. Nombre **Visa Itaú**, cuenta **Banco Itaú** (de ella sale el pago de la factura y viene la moneda de la tarjeta), límite **Gs. 2.000.000**, cierra el día **10** y vence el día **20**.',
                'Open **Cards** (on your phone, **More › Cards**) and tap **Add card**. Name **Visa Itaú**, account **Banco Itaú** (the statement payment comes out of it and it sets the card currency), limit **Gs. 2,000,000**, closes on day **10** and due on day **20**.'),
            s('Toque em **Ver detalhes da fatura** e em **Nova compra**: descrição **Mercado**, valor **150.000**, categoria **Supermercado** e a data. Compras feitas até o dia do fechamento entram na fatura daquele mês; depois dele, na do mês seguinte.',
                'Tocá **Ver detalles de la factura** y **Nueva compra**: descripción **Supermercado**, valor **150.000**, categoría **Supermercado** y la fecha. Las compras hasta el día de cierre entran en la factura de ese mes; después, en la del mes siguiente.',
                'Tap **View statement details** and **New purchase**: description **Groceries**, amount **150,000**, category **Supermarket** and the date. Purchases up to the closing day go on that month\'s statement; after it, on the next one.'),
            s('Use as setas ao lado do mês para ver faturas anteriores e futuras. O **limite usado** soma as compras de todas as faturas ainda não pagas. Dá para **editar** ou **excluir** uma compra enquanto a fatura estiver em aberto.',
                'Usá las flechas junto al mes para ver facturas anteriores y futuras. El **límite usado** suma las compras de todas las facturas aún no pagadas. Podés **editar** o **eliminar** una compra mientras la factura esté abierta.',
                'Use the arrows next to the month to see past and future statements. The **used limit** adds up the purchases of every unpaid statement. You can **edit** or **delete** a purchase while the statement is open.'),
            s('No vencimento, toque em **Pagar fatura**, confira a data e confirme. Só então o total sai da conta e cada compra vira uma despesa paga na categoria dela, nos relatórios.',
                'En el vencimiento, tocá **Pagar factura**, revisá la fecha y confirmá. Solo entonces el total sale de la cuenta y cada compra se vuelve un gasto pagado en su categoría, en los informes.',
                'On the due date, tap **Pay statement**, check the date and confirm. Only then does the total leave the account and each purchase becomes a paid expense in its category, in the reports.'),
            s('Pagou errado? **Desfazer pagamento** apaga esses lançamentos, o saldo volta e a fatura fica em aberto de novo.',
                '¿Pagaste mal? **Deshacer pago** borra esos movimientos, el saldo vuelve y la factura queda abierta otra vez.',
                'Paid by mistake? **Undo payment** deletes those entries, the balance comes back and the statement is open again.'),
            s('Para não esquecer o vencimento, abra **Configurações › Lembretes** e ligue **Avisar quando a fatura do cartão estiver para vencer**: o aviso chega no dia e 1 dia antes, só para faturas ainda não pagas.',
                'Para no olvidar el vencimiento, abrí **Configuración › Recordatorios** y activá **Avisar cuando la factura de la tarjeta esté por vencer**: el aviso llega el día y 1 día antes, solo de facturas aún no pagadas.',
                'So you do not forget the due date, open **Settings › Reminders** and turn on **Notify me when a card statement is about to be due**: the notice arrives on the day and 1 day before, only for statements not paid yet.'),
            s('**Cartões por plano:** Básico 1, Premium 3 e Pro 6 cartões ativos. Arquivar um cartão libera a vaga.',
                '**Tarjetas por plan:** Básico 1, Premium 3 y Pro 6 tarjetas activas. Archivar una tarjeta libera el lugar.',
                '**Cards per plan:** Basic 1, Premium 3 and Pro 6 active cards. Archiving a card frees the slot.')
        ],
        exemplo: [
            { tipo: 'des', rot: s('Mercado · na fatura (saldo não muda)', 'Supermercado · en la factura (el saldo no cambia)', 'Groceries · on the statement (balance unchanged)'), val: '- Gs. 150.000' },
            { tipo: 'des', rot: s('Fatura paga · sai da conta', 'Factura pagada · sale de la cuenta', 'Statement paid · leaves the account'), val: '- Gs. 350.000' }
        ],
        dica: s('Compras de uma fatura já paga não podem ser alteradas: desfaça o pagamento antes. Uma compra nova cuja fatura já foi paga vai para a próxima fatura em aberto.',
            'Las compras de una factura ya pagada no se pueden cambiar: deshacé el pago antes. Una compra nueva cuya factura ya fue pagada va a la próxima factura abierta.',
            'Purchases on an already paid statement cannot be changed: undo the payment first. A new purchase whose statement was already paid goes on the next open statement.')
    },
    {
        id: 'ia-registrar', icone: 'ph-sparkle', link: { href: '/ia', rot: s('Abrir Chat IA', 'Abrir Chat IA', 'Open AI Chat') }, plano: 'premium',
        titulo: s('10. Chat IA: registrar escrevendo, falando ou fotografando', '10. Chat IA: registrar escribiendo, hablando o fotografiando', '10. AI Chat: record by typing, talking or taking a photo'),
        intro: s('A Marina está na rua e não quer abrir formulário. Ela usa o Chat IA para lançar na hora.', 'Marina está en la calle y no quiere abrir un formulario. Usa el Chat IA para cargar en el momento.', 'Marina is out and about and does not want to open a form. She uses AI Chat to record right away.'),
        passos: [
            s('Abra o **Chat IA** (no celular, **Mais › Chat IA**).', 'Abrí el **Chat IA** (en el celular, **Más › Chat IA**).', 'Open **AI Chat** (on your phone, **More › AI Chat**).'),
            s('**Texto:** escreva *Gastei 45.000 no almoço*. A IA escolhe categoria e conta e **registra na hora**.', '**Texto:** escribí *Gasté 45.000 en el almuerzo*. La IA elige categoría y cuenta y **registra al instante**.', '**Text:** type *I spent 45,000 on lunch*. The AI picks the category and account and **records it right away**.'),
            s('**Foto:** toque no ícone de **imagem** (ou da câmera, no celular) e envie a foto do comprovante. A IA lê o estabelecimento, o total e a data. Dá para mandar até 3 fotos.', '**Foto:** tocá el ícono de **imagen** (o de la cámara, en el celular) y enviá la foto del comprobante. La IA lee el comercio, el total y la fecha. Se pueden mandar hasta 3 fotos.', '**Photo:** tap the **image** icon (or the camera, on your phone) and send a photo of the receipt. The AI reads the shop, the total and the date. You can send up to 3 photos.'),
            s('**Áudio:** toque no **microfone**, fale *Paguei a conta de luz, 180 mil* e toque de novo para parar (até 60 segundos).', '**Audio:** tocá el **micrófono**, decí *Pagué la cuenta de luz, 180 mil* y tocá de nuevo para parar (hasta 60 segundos).', '**Voice:** tap the **microphone**, say *I paid the electricity bill, 180 thousand* and tap again to stop (up to 60 seconds).'),
            s('**No cartão de crédito:** escreva *Gastei 80.000 no mercado no cartão Visa*. A compra vai para a fatura certa e o saldo só muda quando você pagar a fatura (o pagamento é feito na tela **Cartões**).', '**En la tarjeta de crédito:** escribí *Gasté 80.000 en el supermercado con la tarjeta Visa*. La compra va a la factura correcta y el saldo solo cambia cuando pagues la factura (el pago se hace en la pantalla **Tarjetas**).', '**On the credit card:** type *I spent 80,000 on groceries with my Visa card*. The purchase goes on the right statement and the balance only changes when you pay the statement (payment is done on the **Cards** screen).'),
            s('Cada registro aparece num cartão com o botão **Reverter** por **10 segundos**. Se a IA entendeu errado, toque nele e explique de novo.', 'Cada registro aparece en una tarjeta con el botón **Revertir** por **10 segundos**. Si la IA entendió mal, tocalo y explicá de nuevo.', 'Each entry appears in a card with an **Undo** button for **10 seconds**. If the AI got it wrong, tap it and explain again.'),
            s('Foto e áudio têm cota mensal de registros: **10 no Premium e 30 no Pro**. O contador aparece embaixo do chat; registrar por texto não conta.', 'Foto y audio tienen cuota mensual de registros: **10 en el Premium y 30 en el Pro**. El contador aparece debajo del chat; registrar por texto no cuenta.', 'Photo and voice have a monthly quota of entries: **10 on Premium and 30 on Pro**. The counter shows under the chat; recording by text does not count.')
        ],
        dica: s('Sempre confira o valor e a categoria no cartão: a IA pode errar, principalmente com foto borrada ou áudio com barulho. Se faltar algo (conta ou categoria), ela pergunta antes de registrar.', 'Siempre revisá el valor y la categoría en la tarjeta: la IA puede equivocarse, sobre todo con fotos borrosas o audio con ruido. Si falta algo (cuenta o categoría), pregunta antes de registrar.', 'Always check the amount and category on the card: the AI can make mistakes, especially with blurry photos or noisy audio. If something is missing (account or category), it asks before recording.')
    },
    {
        id: 'ia-analisar', icone: 'ph-chats-circle', link: { href: '/ia', rot: s('Abrir Chat IA', 'Abrir Chat IA', 'Open AI Chat') }, plano: 'premium',
        titulo: s('11. Chat IA: entender e analisar seus números', '11. Chat IA: entender y analizar tus números', '11. AI Chat: understand and analyze your numbers'),
        intro: s('O chat também responde perguntas sobre as finanças da Marina, em linguagem normal.', 'El chat también responde preguntas sobre las finanzas de Marina, en lenguaje normal.', 'The chat also answers questions about Marina\'s finances, in plain language.'),
        passos: [
            s('Pergunte o que ainda falta: *Quais gastos ainda preciso pagar?*, *Quanto tenho para receber?*, *O que vence nos próximos 7 dias?*', 'Preguntá lo que todavía falta: *¿Qué gastos todavía tengo que pagar?*, *¿Cuánto tengo para cobrar?*, *¿Qué vence en los próximos 7 días?*', 'Ask what is still due: *Which expenses do I still need to pay?*, *How much do I have to receive?*, *What is due in the next 7 days?*'),
            s('Peça uma análise: *Faça um resumo do mês até hoje*, *Em que categoria gastei mais este mês?*, *Qual o saldo das minhas contas?*', 'Pedí un análisis: *Hacé un resumen del mes hasta hoy*, *¿En qué categoría gasté más este mes?*, *¿Cuál es el saldo de mis cuentas?*', 'Ask for an analysis: *Give me a summary of this month so far*, *Which category did I spend the most on this month?*, *What is the balance of my accounts?*'),
            s('Os números vêm dos seus próprios dados: a IA não inventa valores. Se algo parecer estranho, confira em **Relatórios**.', 'Los números vienen de tus propios datos: la IA no inventa valores. Si algo parece raro, revisalo en **Informes**.', 'The numbers come from your own data: the AI does not make up values. If something looks odd, check it in **Reports**.'),
            s('**Pro, IA avançada:** além de registrar, ela mexe no que já existe: marca como pago (*Paguei a internet e o aluguel*), edita valor ou categoria, cria categorias e faz transferências. Tudo aparece num resumo, com **Reverter** por 10 segundos.', '**Pro, IA avanzada:** además de registrar, trabaja con lo que ya existe: marca como pagado (*Pagué internet y el alquiler*), edita valor o categoría, crea categorías y hace transferencias. Todo aparece en un resumen, con **Revertir** por 10 segundos.', '**Pro, advanced AI:** besides recording, it works on what already exists: marks items as paid (*I paid the internet and the rent*), edits amounts or categories, creates categories and makes transfers. Everything shows in a summary, with **Undo** for 10 seconds.')
        ],
        dica: s('A IA só fala das suas finanças e de como usar o app. Os limites mensais de mensagens são 300 no Premium e 600 no Pro.', 'La IA solo habla de tus finanzas y de cómo usar la app. Los límites mensuales de mensajes son 300 en el Premium y 600 en el Pro.', 'The AI only talks about your finances and how to use the app. The monthly message limits are 300 on Premium and 600 on Pro.')
    },
    {
        id: 'compras', icone: 'ph-shopping-cart', modulo: 'compras', link: { href: '/compras', rot: s('Abrir Compras', 'Abrir Compras', 'Open Shopping') },
        titulo: s('11. Lista de compras do mercado', '11. Lista de compras del supermercado', '11. Grocery shopping list'),
        intro: s('A Marina sempre volta do mercado esquecendo alguma coisa. Com o módulo **Compras**, a lista fica no celular e o gasto vira lançamento sozinho.',
            'Marina siempre vuelve del supermercado olvidándose de algo. Con el módulo **Compras**, la lista queda en el celular y el gasto se registra solo.',
            'Marina always comes home from the supermarket having forgotten something. With the **Shopping** module, the list lives on her phone and the spending is recorded automatically.'),
        passos: [
            s('Abra **Compras** (no celular, **Mais › Compras**) e toque em **Nova lista**. Nome **Mercado do mês**, categoria do gasto **Supermercado** e conta **Banco Itaú**. A categoria é uma das suas e a lista guarda essa escolha para as próximas compras.',
                'Abrí **Compras** (en el celular, **Más › Compras**) y tocá **Nueva lista**. Nombre **Supermercado del mes**, categoría del gasto **Supermercado** y cuenta **Banco Itaú**. La categoría es una de las tuyas y la lista guarda esa elección para las próximas compras.',
                'Open **Shopping** (on your phone, **More › Shopping**) and tap **New list**. Name it **Monthly groceries**, spending category **Supermarket** and account **Banco Itaú**. The category is one of yours and the list remembers it for future purchases.'),
            s('Dentro da lista, digite os itens e toque em **Adicionar**. Dá para colocar vários de uma vez, separados por vírgula: *leite, arroz, café*. Os produtos que você já comprou aparecem como sugestão e voltam com o último preço pago.',
                'Dentro de la lista, escribí los ítems y tocá **Agregar**. Podés poner varios a la vez, separados por coma: *leche, arroz, café*. Los productos que ya compraste aparecen como sugerencia y vuelven con el último precio pagado.',
                'Inside the list, type the items and tap **Add**. You can add several at once, separated by commas: *milk, rice, coffee*. Products you already bought show up as suggestions and come back with the last price you paid.'),
            s('No mercado, toque no círculo de cada item que colocar no carrinho. Se quiser, informe o preço ao lado: com os preços, a **Estimativa** mostra quanto a compra deve custar.',
                'En el supermercado, tocá el círculo de cada ítem que pongas en el carrito. Si querés, ingresá el precio al lado: con los precios, la **Estimación** muestra cuánto debería costar la compra.',
                'At the supermarket, tap the circle next to each item you put in the cart. If you like, enter the price beside it: with prices, the **Estimate** shows how much the purchase should cost.'),
            s('Na saída, toque em **Fechar compra**. Informe o **total pago** (o app mostra se ficou acima ou abaixo da estimativa), confira a conta e a categoria e toque em **Salvar compra e lançar gasto**.',
                'A la salida, tocá **Cerrar compra**. Ingresá el **total pagado** (la app muestra si quedó por encima o por debajo de la estimación), revisá la cuenta y la categoría y tocá **Guardar compra y registrar gasto**.',
                'On the way out, tap **Close purchase**. Enter the **total paid** (the app shows whether it was above or below the estimate), check the account and category and tap **Save purchase and record expense**.'),
            s('O gasto entra como despesa já paga, na categoria da lista. O que você não marcou fica para a próxima compra, ou sai da lista se você escolher **Tirar da lista**.',
                'El gasto entra como un gasto ya pagado, en la categoría de la lista. Lo que no marcaste queda para la próxima compra, o sale de la lista si elegís **Quitar de la lista**.',
                'The spending is recorded as an expense already paid, in the list category. What you did not check stays for the next purchase, or leaves the list if you choose **Remove from the list**.')
        ],
        exemplo: [{ tipo: 'des', rot: s('Mercado do mês · pago', 'Supermercado del mes · pagado', 'Monthly groceries · paid'), val: '- Gs. 420.000' }],
        dica: s('Sem preços a estimativa não aparece, para não inventar um número. Informe o preço dos itens que mais pesam ou feche algumas compras: o app passa a mostrar *Você costuma gastar cerca de...*, pela média das últimas compras.',
            'Sin precios la estimación no aparece, para no inventar un número. Ingresá el precio de los ítems que más pesan o cerrá algunas compras: la app pasa a mostrar *Solés gastar alrededor de...*, por el promedio de las últimas compras.',
            'Without prices the estimate does not appear, so the app never makes up a number. Enter the price of the items that weigh most or close a few purchases: the app then shows *You usually spend about...*, from the average of your last purchases.')
    },
    {
        id: 'compras-avisos', icone: 'ph-hourglass-medium', modulo: 'compras', plano: 'premium', link: { href: '/compras', rot: s('Abrir Compras', 'Abrir Compras', 'Open Shopping') },
        titulo: s('12. Itens acabando e leitura da nota', '12. Ítems que se acaban y lectura de la factura', '12. Items running out and receipt reading'),
        intro: s('Depois de algumas compras, o app aprende o ritmo de cada produto e a Marina ganha dois atalhos.',
            'Después de algunas compras, la app aprende el ritmo de cada producto y Marina gana dos atajos.',
            'After a few purchases, the app learns the rhythm of each product and Marina gets two shortcuts.'),
        passos: [
            s('Depois de **3 compras** do mesmo produto, o app descobre a cada quantos dias você o compra. Quando chega perto da hora e ele não está em nenhuma lista, aparece o bloco **Provavelmente acabando** com o botão **Adicionar**.',
                'Después de **3 compras** del mismo producto, la app descubre cada cuántos días lo comprás. Cuando se acerca la hora y no está en ninguna lista, aparece el bloque **Probablemente se está acabando** con el botón **Agregar**.',
                'After **3 purchases** of the same product, the app works out how many days apart you buy it. When the time is near and it is on no list, the **Probably running out** block appears with an **Add** button.'),
            s('**Agora não** esconde o aviso por um ciclo inteiro. O **X** para de avisar daquele item (os avisos voltam se você o adicionar a uma lista de novo).',
                '**Ahora no** esconde el aviso por un ciclo entero. La **X** deja de avisar de ese ítem (los avisos vuelven si lo agregás a una lista otra vez).',
                '**Not now** hides the reminder for a whole cycle. The **X** stops reminders for that item (they come back if you add it to a list again).'),
            s('Para receber como notificação, abra **Configurações › Lembretes** e ligue **Avisar quando itens de compras estiverem acabando**. O mesmo item avisa no máximo a cada 3 dias.',
                'Para recibirlo como notificación, abrí **Configuración › Recordatorios** y activá **Avisar cuando ítems de compras se estén acabando**. El mismo ítem avisa como máximo cada 3 días.',
                'To get it as a notification, open **Settings › Reminders** and turn on **Notify me when shopping items are running out**. The same item reminds you at most every 3 days.'),
            s('Na tela **Fechar compra**, toque em **Foto da nota**. O app lê o total, a data e o preço de cada item e já reconhece o que estava na sua lista. O que você comprou fora da lista também é registrado.',
                'En la pantalla **Cerrar compra**, tocá **Foto de la factura**. La app lee el total, la fecha y el precio de cada ítem y ya reconoce lo que estaba en tu lista. Lo que compraste fuera de la lista también se registra.',
                'On the **Close purchase** screen, tap **Receipt photo**. The app reads the total, the date and each item price and recognizes what was on your list. Things you bought outside the list are recorded too.'),
            s('Confira os valores e desmarque o que não quiser. **Nada é salvo até você tocar em Salvar compra e lançar gasto.** A foto não é guardada.',
                'Revisá los valores y desmarcá lo que no quieras. **No se guarda nada hasta que toques Guardar compra y registrar gasto.** La foto no se guarda.',
                'Check the amounts and uncheck anything you do not want. **Nothing is saved until you tap Save purchase and record expense.** The photo is not stored.'),
            s('A leitura de nota usa a IA e conta como uma foto na cota do mês do seu plano (**10 no Premium e 30 no Pro**, a mesma do Chat IA). Se a foto não mostrar uma nota legível, a tentativa não gasta a cota.',
                'La lectura de facturas usa la IA y cuenta como una foto en la cuota del mes de tu plan (**10 en el Premium y 30 en el Pro**, la misma del Chat IA). Si la foto no muestra una factura legible, el intento no gasta la cuota.',
                'Receipt reading uses AI and counts as one photo in your plan\'s monthly quota (**10 on Premium and 30 on Pro**, the same as AI Chat). If the photo does not show a readable receipt, the attempt does not use up the quota.')
        ],
        dica: s('Fotografe a nota inteira, reta e bem iluminada. Se o total lido não bater com a soma dos itens, o app avisa: confira os valores antes de salvar. Os avisos de consumo funcionam melhor quando você fecha as compras no app, porque é ali que as datas ficam guardadas.',
            'Fotografiá la factura entera, recta y bien iluminada. Si el total leído no coincide con la suma de los ítems, la app avisa: revisá los valores antes de guardar. Los avisos de consumo funcionan mejor cuando cerrás las compras en la app, porque ahí se guardan las fechas.',
            'Photograph the whole receipt, flat and well lit. If the total it reads does not match the sum of the items, the app warns you: check the amounts before saving. Consumption reminders work best when you close purchases in the app, because that is where the dates are kept.')
    },
    {
        id: 'rotina', icone: 'ph-calendar-check',
        titulo: s('12. A rotina de 5 minutos da Marina', '12. La rutina de 5 minutos de Marina', '12. Marina\'s 5-minute routine'),
        intro: s('Com tudo configurado, manter o controle dá pouco trabalho:', 'Con todo configurado, mantener el control da poco trabajo:', 'With everything set up, staying in control takes little effort:'),
        passos: [
            s('**Todo dia (1 minuto):** lançar o que gastou, pelo **+** ou falando com a IA.', '**Todos los días (1 minuto):** cargar lo que gastó, con el **+** o hablando con la IA.', '**Every day (1 minute):** record what you spent, with the **+** or by talking to the AI.'),
            s('**Toda segunda (2 minutos):** abrir **Relatórios › Pendentes › Próximos 7 Dias** e pagar o que vence.', '**Cada lunes (2 minutos):** abrir **Informes › Pendientes › Próximos 7 Días** y pagar lo que vence.', '**Every Monday (2 minutes):** open **Reports › Pending › Next 7 Days** and pay what is due.'),
            s('**Todo fim de mês (2 minutos):** ver os **Gráficos** do mês (e o **Demonstrativo**, no Premium) e ajustar os limites do mês seguinte.', '**Cada fin de mes (2 minutos):** ver los **Gráficos** del mes (y el **Estado financiero**, en el Premium) y ajustar los límites del mes siguiente.', '**Every month-end (2 minutes):** look at the month\'s **Charts** (and the **Statement**, on Premium) and adjust next month\'s limits.'),
            s('**Uma vez:** instale o app no celular em **Configurações** para abri-lo como um aplicativo. No Premium e no Pro dá para registrar mesmo sem internet; o app envia tudo quando a conexão voltar.', '**Una vez:** instalá la app en el celular desde **Configuración** para abrirla como una aplicación. En el Premium y el Pro se puede registrar aun sin internet; la app envía todo cuando vuelva la conexión.', '**Once:** install the app on your phone from **Settings** to open it like a regular app. On Premium and Pro you can record even without internet; the app sends everything when the connection is back.')
        ],
        dica: s('Ficou com alguma dúvida? Pergunte no **Chat IA** (como usar o app) ou conte na **Comunidade**: sugestões e problemas ajudam o app a melhorar.', '¿Te quedó alguna duda? Preguntá en el **Chat IA** (cómo usar la app) o contá en la **Comunidad**: sugerencias y problemas ayudan a mejorar la app.', 'Still have questions? Ask in **AI Chat** (how to use the app) or post in **Community**: suggestions and problems help the app improve.')
    }
];

const idx = (lang) => {
    const l = String(lang || '').toLowerCase();
    return l.startsWith('es') ? 1 : (l.startsWith('en') ? 2 : 0);
};

// Devolve as secoes no idioma pedido, prontas para a tela.
// modulos: modulos liberados para a pessoa (ex.: ['compras']). Secoes de um modulo so aparecem para quem o tem, e a numeracao dos titulos e refeita.
function montar(lang, { modulos = [] } = {}) {
    const i = idx(lang);
    return SECOES.filter((sec) => !sec.modulo || modulos.includes(sec.modulo)).map((sec, n) => ({
        id: sec.id,
        icone: sec.icone,
        plano: sec.plano || null,
        titulo: `${n + 1}. ${sec.titulo[i].replace(/^\d+\.\s*/, '')}`,
        intro: sec.intro ? sec.intro[i] : '',
        passos: sec.passos.map((p) => p[i]),
        exemplo: (sec.exemplo || []).map((e) => ({ tipo: e.tipo, rot: e.rot[i], val: e.val })),
        dica: sec.dica ? sec.dica[i] : '',
        link: sec.link ? { href: sec.link.href, rot: sec.link.rot[i] } : null
    }));
}

module.exports = { montar, SECOES };
