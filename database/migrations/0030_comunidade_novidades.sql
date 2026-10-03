-- Comunidade > Novidades: avisos escritos pela equipe (novos modulos, novidades e melhorias). Nada e gerado automaticamente.
-- Cada novidade tem titulo e texto nos tres idiomas; o usuario ve sempre o idioma da sua conta.
-- tipo: modulo | novidade | melhoria. estado: rascunho | publicada.
CREATE TABLE IF NOT EXISTS comunidade_novidades (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tipo          VARCHAR(12)   NOT NULL DEFAULT 'novidade',
    titulo_pt     VARCHAR(140)  NOT NULL DEFAULT '',
    titulo_es     VARCHAR(140)  NOT NULL DEFAULT '',
    titulo_en     VARCHAR(140)  NOT NULL DEFAULT '',
    texto_pt      TEXT          NULL,
    texto_es      TEXT          NULL,
    texto_en      TEXT          NULL,
    estado        VARCHAR(12)   NOT NULL DEFAULT 'rascunho',
    publicada_em  DATETIME      NULL,
    post_id       INT UNSIGNED  NULL,
    created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_com_nov_estado (estado, publicada_em),
    CONSTRAINT fk_com_nov_post FOREIGN KEY (post_id) REFERENCES comunidade_posts (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Reacao do usuario: valor 1 = gostei, -1 = nao gostei (uma por usuario e novidade).
CREATE TABLE IF NOT EXISTS comunidade_novidades_reacoes (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    novidade_id   INT UNSIGNED  NOT NULL,
    user_id       INT UNSIGNED  NOT NULL,
    valor         TINYINT       NOT NULL,
    created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_com_nov_reacao (novidade_id, user_id),
    CONSTRAINT fk_com_nov_reacao_nov FOREIGN KEY (novidade_id) REFERENCES comunidade_novidades (id) ON DELETE CASCADE,
    CONSTRAINT fk_com_nov_reacao_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Quando o usuario abriu "Novidades" pela ultima vez (alimenta o selinho do menu).
ALTER TABLE users ADD COLUMN novidades_vistas_em DATETIME NULL;

-- Textos iniciais, como RASCUNHO: revise e publique em Admin > Novidades. So funcionalidades novas, nenhuma correcao de erro.
INSERT INTO comunidade_novidades (tipo, titulo_pt, titulo_es, titulo_en, texto_pt, texto_es, texto_en)
VALUES ('modulo',
  'Estado Financeiro nos Relatórios', 'Estado Financiero en los Informes', 'Financial Statement in Reports',
  'Um novo demonstrativo mostra o resultado do período, compara com o período anterior (você escolhe qual), traz o fluxo de caixa e uma visão por conta. Tudo pode ser exportado em PDF ou CSV.',
  'Un nuevo estado muestra el resultado del período, lo compara con el período anterior (usted elige cuál), incluye el flujo de caja y una vista por cuenta. Todo se puede exportar en PDF o CSV.',
  'A new statement shows the result for the period, compares it with a previous period of your choice, includes cash flow and a per-account view. Everything can be exported as PDF or CSV.');

INSERT INTO comunidade_novidades (tipo, titulo_pt, titulo_es, titulo_en, texto_pt, texto_es, texto_en)
VALUES ('modulo',
  'Use o app sem internet', 'Use la app sin internet', 'Use the app offline',
  'Instale o app no celular e registre receitas, despesas e transferências mesmo sem conexão. Os registros ficam guardados no aparelho e são enviados sozinhos quando a internet volta. Disponível nos planos Premium e Pro.',
  'Instale la app en el celular y registre ingresos, gastos y transferencias incluso sin conexión. Los registros quedan guardados en el aparato y se envían solos cuando vuelve la internet. Disponible en los planes Premium y Pro.',
  'Install the app on your phone and record income, expenses and transfers even without a connection. Entries are kept on your device and sent automatically when the internet is back. Available on the Premium and Pro plans.');

INSERT INTO comunidade_novidades (tipo, titulo_pt, titulo_es, titulo_en, texto_pt, texto_es, texto_en)
VALUES ('novidade',
  'Lembretes de vencimento no celular', 'Recordatorios de vencimiento en el celular', 'Due-date reminders on your phone',
  'Receba uma notificação quando uma conta estiver para vencer: despesas a pagar, receitas a receber, transferências programadas e itens atrasados. Ative em Configurações.',
  'Reciba una notificación cuando una cuenta esté por vencer: gastos por pagar, ingresos por cobrar, transferencias programadas y ítems atrasados. Actívela en Configuración.',
  'Get a notification when a bill is about to be due: expenses to pay, income to receive, scheduled transfers and overdue items. Turn it on in Settings.');

INSERT INTO comunidade_novidades (tipo, titulo_pt, titulo_es, titulo_en, texto_pt, texto_es, texto_en)
VALUES ('melhoria',
  'Painel: fixas x variáveis e saldo oculto', 'Panel: fijos x variables y saldo oculto', 'Dashboard: fixed vs variable and hidden balance',
  'O painel agora compara suas despesas e receitas fixas e variáveis com o período anterior. Também há um botão para ocultar o saldo na tela quando alguém estiver por perto.',
  'El panel ahora compara sus gastos e ingresos fijos y variables con el período anterior. También hay un botón para ocultar el saldo en pantalla cuando haya alguien cerca.',
  'The dashboard now compares your fixed and variable expenses and income with the previous period. There is also a button to hide the balance on screen when someone is nearby.');

INSERT INTO comunidade_novidades (tipo, titulo_pt, titulo_es, titulo_en, texto_pt, texto_es, texto_en)
VALUES ('melhoria',
  'Extrato da conta com filtros', 'Extracto de la cuenta con filtros', 'Account statement with filters',
  'No extrato de cada conta você pode filtrar por período, tipo e situação, buscar pelo nome e escolher a ordem da lista.',
  'En el extracto de cada cuenta puede filtrar por período, tipo y estado, buscar por nombre y elegir el orden de la lista.',
  'In each account statement you can filter by period, type and status, search by name and choose the sort order.');

INSERT INTO comunidade_novidades (tipo, titulo_pt, titulo_es, titulo_en, texto_pt, texto_es, texto_en)
VALUES ('melhoria',
  'Editar transferências e lançamentos com mais liberdade', 'Editar transferencias y movimientos con más libertad', 'Edit transfers and entries more freely',
  'Agora é possível editar o valor, a data e a situação de uma transferência entre contas, e editar um lançamento no mesmo formulário do cadastro, inclusive transformando-o em fixo ou parcelado.',
  'Ahora se puede editar el valor, la fecha y el estado de una transferencia entre cuentas, y editar un movimiento en el mismo formulario del registro, incluso convirtiéndolo en fijo o en cuotas.',
  'You can now edit the amount, date and status of a transfer between accounts, and edit an entry in the same form used to create it, even turning it into a fixed or installment entry.');
