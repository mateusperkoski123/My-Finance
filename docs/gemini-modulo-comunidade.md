# TAREFA: criar o módulo "Comunidade" (sugestões e erros) no MyFinance

Você vai gerar a parte extensa do módulo (banco, models, controllers, rotas, views, CSS, JS e traduções). Eu (o dono do projeto) vou revisar depois, principalmente as partes de segurança. Siga este documento à risca. Em caso de dúvida, escolha a opção mais simples e anote a dúvida no relatório final; **não invente funcionalidades extras**.

---

## 0. REGRAS ABSOLUTAS (leia antes de tudo)

1. **O `GEMINI.md` da raiz está desatualizado**: ele descreve uma versão PHP. A aplicação que roda em produção é **Node.js + Express + EJS + MySQL/MariaDB**. Ignore tudo no `GEMINI.md` sobre PHP, `database/migrate.php`, `src/Controllers`, `src/Models`, `views/*.php` e `lang/*.php`. Trabalhe **somente** em `src/node/`, `views/*.ejs`, `public/assets/`, `database/migrations/` e `server.js` (apenas se necessário).
2. **NÃO** faça `git push`, `git commit`, deploy, nem acesse o banco de produção (Hostinger). Deixe as alterações no diretório de trabalho para eu revisar.
3. **NÃO** edite migrations existentes (`0001` a `0013`). Crie **somente** a nova `0014`.
4. **NÃO** altere tabelas existentes (`users`, `contas`, `lancamentos`, `categorias`, `assinaturas`, `planos`, `pagamentos`, `login_logs`). O módulo só **referencia** `users` por chave estrangeira.
5. **NÃO** adicione dependências novas ao `package.json` (já existem: express, ejs, express-ejs-layouts, mysql2, multer, express-rate-limit, express-session, helmet, bcryptjs, nodemailer). Sem React/Vue/jQuery/Tailwind. JavaScript puro e CSS puro.
6. **NÃO** mexa na lógica de assinatura/planos, no login, nem na tela de termos.
7. Todo texto visível ao usuário deve usar o dicionário de tradução em **3 idiomas** (pt-BR, es-PY, en-US). Nada de texto fixo nas views, nos controllers ou no JS do navegador.
8. Código, identificadores e comentários em **português** (como o resto do projeto), no mesmo estilo dos arquivos vizinhos.

---

## 1. Contexto técnico do projeto (padrões que você deve imitar)

- **Servidor:** `server.js` (Express). Ordem dos middlewares: sessão → carrega `req.user` → `i18nMiddleware` (cria `req.t`, `req.lang`, `res.locals.t`, `res.locals.lang`, `res.locals.theme`) → `csrfMiddleware` → `contaMiddleware` (suspensão, termos, modo somente leitura; cria `res.locals.assinatura`, `res.locals.ehAdmin`, `req.ehAdmin`) → helpers de view → rotas.
- **Rotas:** `src/node/routes/index.js`. Já existe um wrapper que captura erros de handlers `async` em `router.get/post`. Use `requireAuth` em todas as rotas do módulo. Admin: `requireAuth, exigirAdmin` (de `src/node/middleware/contaMiddleware.js`).
- **Controllers:** objetos com funções `(req, res)`, como `src/node/controllers/assinaturaController.js` e `contasController.js`. Mensagens de retorno: `req.session.flash = { tipo: 'sucesso'|'erro', mensagem: req.t('flash.chave') }` e `res.redirect(...)`.
- **Models:** classes com métodos estáticos usando o pool `require('../config/db')` (mysql2/promise). Veja `src/node/models/Assinatura.js` e `User.js`. **Sempre use placeholders `?`** (nunca concatene valores em SQL). `LIMIT`/`OFFSET` também com `?` e números inteiros validados.
- **Views:** EJS em `views/`, renderizadas dentro de `views/layout.ejs`. Variáveis disponíveis em toda view: `t`, `lang`, `theme`, `usuarioLogado`, `ehAdmin`, `csrfCampo` (HTML do input oculto), `csrfToken`, `currentRoute`, `currentUrl`, `formatDate(data, 'DD/MM/YYYY')`, `moeda()`, `truncarTexto(texto, n)`.
- **i18n:** dicionários em `src/node/core/i18n.js` (pt-BR e es-PY), `i18n_en.js` (en-US), e arquivos de chaves extras no formato `'chave': [pt-BR, es-PY, en-US]` em `i18n_extra.js` e `i18n_assinatura.js`. **Crie um arquivo novo `src/node/core/i18n_comunidade.js`** com todas as chaves do módulo (prefixo `comunidade.*` e `flash.comunidade_*`) e registre-o em `i18n.js` na linha que faz `Object.assign({}, require('./i18n_extra'), require('./i18n_assinatura'))`. Substituição de variáveis: `t('chave', { nome: 'x' })` troca `{nome}`.
- **Migrations:** arquivos `.sql` em `database/migrations/`, aplicados automaticamente na inicialização por `src/node/core/migrator.js`. O runner ignora erros "já existe" e divide os comandos por `;` no fim da linha. Portanto: **um comando por instrução, termine cada um com `;` seguido de quebra de linha, sem `;` dentro de strings, e comentários só em linhas que começam com `--`.** Use `CREATE TABLE IF NOT EXISTS`, `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, e nomes de FK explícitos. O banco de produção é MariaDB/MySQL: não use recursos exclusivos de MySQL 8.
- **Modais:** o projeto já tem o padrão `.modal-backdrop` + `.modal.card` + `.modal__header` + `.modal__close`, abertos por `data-modal-open="id"` e fechados por `data-modal-close` (lógica em `public/assets/js/app.js`). No celular, modais viram *bottom sheet*. Reaproveite.
- **CSS:** `public/assets/css/app.css`, com variáveis para tema claro/escuro: `--bg --card --text --muted --border --green --green-bg --red --red-bg --blue --on-accent --primary --primary-text --shadow --pendente`. **Nunca use cores fixas** (`#fff`, `#000`, etc.) em elementos de interface: o tema escuro deve funcionar. Para texto sobre `--green`/`--red`/`--blue` use `var(--on-accent)`. Breakpoint mobile: `768px`. Alvos de toque ≥ 44px no mobile. Ícones: Phosphor (`<i class="ph ph-xxx"></i>`), já carregados no layout.
- **CSRF:** o `csrfMiddleware` valida `req.body._csrf`, `req.query._csrf` ou o header `x-csrf-token`. **ATENÇÃO:** em formulários `multipart/form-data` o corpo ainda não foi lido quando o CSRF é validado (o multer roda depois), então para envios com arquivo você **deve** mandar o token no header `X-CSRF-Token` (se usar `fetch`) ou na query string `?_csrf=<%= csrfToken %>` (se usar `<form>` normal), como já faz `views/configuracoes/dados.ejs`. Adicione em `views/layout.ejs`, dentro do `<head>`, `<meta name="csrf-token" content="<%= csrfToken %>">` (apenas essa linha) para o JS ler.
- **JS global:** `public/assets/js/app.js` tem um listener global de `submit` que trata formulários com `data-ajax` usando `URLSearchParams` (não serve para arquivos). Para o módulo, escreva um arquivo novo `public/assets/js/comunidade.js`, carregado só nas páginas do módulo, e **não** use `data-ajax` nos formulários com arquivo. Os textos do JS vêm de `window.GF_T` (objeto montado no `<head>` do layout) ou de atributos `data-*` renderizados pela view; **não** escreva texto fixo no JS.
- **Idiomas e usuário:** o idioma do usuário está em `req.lang`; nomes de planos etc. não são necessários neste módulo.

---

## 2. Regras de negócio (decididas pelo dono do projeto)

- **Quem acessa:** todos os usuários logados, de qualquer plano (incluindo o Plano de Teste). Não exija recurso de plano.
- **Visibilidade:** todas as postagens (sugestões **e erros**) são **públicas para todos os usuários logados**. Visitante sem login não vê nada (rotas exigem `requireAuth`).
- **Modo somente leitura:** usuários com assinatura vencida/cancelada **podem ler**, mas não postar/votar/comentar. Isso já é aplicado automaticamente pelo `contaMiddleware` (bloqueia POST fora da lista de rotas livres). **Não** adicione `/comunidade` à lista de rotas livres; não precisa fazer nada.
- **Privacidade:** nunca exiba e-mail de ninguém. Exiba o autor como **primeiro nome + inicial do sobrenome** (ex.: "Mateus P."). Postagens/comentários da equipe (`role = 'admin'`) mostram o selo **"Equipe"** e o nome do app em vez do nome pessoal.
- **Categorias da postagem:** `sugestao` (Sugestão de melhoria) e `bug` (Informar erro).
- **Status:** `novo` → `em_analise` → `planejado` → `em_andamento` → `resolvido`, ou `recusado`. Toda postagem nasce `novo`. Só o admin altera o status.
- **Votos:** cada usuário vota uma vez por postagem (alternar voto/desvoto). O autor pode votar na própria postagem. O contador exibido é o total de votos.
- **Importância (opcional, 1 por usuário/postagem):** níveis `1 Não importante`, `2 Bom ter`, `3 Importante`, `4 Essencial`. Clicar no mesmo nível de novo remove a escolha. Mostrar a contagem por nível apenas para admin (no detalhe); para usuários comuns mostrar só a própria escolha.
- **Seguir ("Ser notificado"):** o usuário pode seguir/desseguir uma postagem. O autor segue automaticamente a própria postagem. **Neste momento NÃO envie e-mails**; apenas grave a inscrição (o envio será outra etapa).
- **Comentários:** qualquer logado comenta. Podem ter até 2 imagens. Admin pode excluir qualquer comentário; o autor pode excluir o próprio. Comentário de admin tem selo "Equipe".
- **Excluir postagem:** o autor só pode excluir a própria postagem se **não tiver comentários de outras pessoas e não estiver resolvida**. Admin pode excluir ou **ocultar** qualquer uma (ocultar = some da lista e do detalhe para usuários comuns, mas continua no banco).
- **Edição pelo autor:** fora do escopo. Não implemente edição de postagem/comentário.
- **Limites de texto:** título 5–120 caracteres; descrição 10–5000; comentário 1–2000. Valide no servidor (e com `maxlength`/`minlength` no HTML).
- **Anexos de imagem:** até **4 imagens por postagem** e **2 por comentário**, **2 MB cada**, formatos **PNG, JPEG, WebP e GIF**. **SVG é proibido.**
- **Erros (`bug`):** além dos campos normais, o formulário mostra os campos "O que aconteceu?" (já é a descrição) e "O que você esperava?" (opcional, até 1000). Guarde também `contexto_url` (a página onde o usuário estava; vem de um campo oculto preenchido pelo JS com `location.pathname` do referrer, **máximo 255 caracteres, só path, sem query string**) e `contexto_ua` (User-Agent, máx. 255), **somente para `bug`**, e mostre no formulário o aviso traduzido "Vamos anexar a página e o navegador para ajudar a equipe a reproduzir o erro".

---

## 3. Banco de dados: crie `database/migrations/0014_create_comunidade.sql`

Use exatamente estas tabelas (você pode ajustar tipos menores, mas mantenha nomes, relações e índices):

```sql
-- Modulo Comunidade: sugestoes e erros enviados pelos usuarios.
CREATE TABLE IF NOT EXISTS comunidade_posts (
    id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id          INT UNSIGNED  NULL,
    categoria        VARCHAR(20)   NOT NULL DEFAULT 'sugestao',
    titulo           VARCHAR(120)  NOT NULL,
    descricao        TEXT          NOT NULL,
    esperado         VARCHAR(1000) NULL,
    contexto_url     VARCHAR(255)  NULL,
    contexto_ua      VARCHAR(255)  NULL,
    status           VARCHAR(20)   NOT NULL DEFAULT 'novo',
    oculto           TINYINT(1)    NOT NULL DEFAULT 0,
    votos            INT UNSIGNED  NOT NULL DEFAULT 0,
    comentarios      INT UNSIGNED  NOT NULL DEFAULT 0,
    resolvido_em     DATETIME      NULL,
    created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_com_posts_categoria (categoria),
    KEY idx_com_posts_status (status),
    KEY idx_com_posts_votos (votos),
    KEY idx_com_posts_data (created_at),
    KEY idx_com_posts_user (user_id),
    CONSTRAINT fk_com_posts_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

Outras tabelas (todas com `CREATE TABLE IF NOT EXISTS`, `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, FKs nomeadas e `ON DELETE CASCADE` ligando ao post):

- `comunidade_votos`: `id`, `post_id`, `user_id`, `created_at`; **UNIQUE (post_id, user_id)**; FK post (CASCADE) e user (CASCADE).
- `comunidade_importancia`: `id`, `post_id`, `user_id`, `nivel TINYINT`, `created_at`; **UNIQUE (post_id, user_id)**.
- `comunidade_inscricoes`: `id`, `post_id`, `user_id`, `created_at`; **UNIQUE (post_id, user_id)**.
- `comunidade_comentarios`: `id`, `post_id`, `user_id NULL` (FK `ON DELETE SET NULL`), `corpo TEXT`, `da_equipe TINYINT(1) DEFAULT 0`, `created_at`; índice em `post_id`.
- `comunidade_anexos`: `id`, `post_id NULL`, `comentario_id NULL` (ambos FK CASCADE), `user_id NULL` (SET NULL), `nome_original VARCHAR(190)`, `mime VARCHAR(50)`, `tamanho INT UNSIGNED`, `dados MEDIUMBLOB NOT NULL`, `created_at`; índices em `post_id` e `comentario_id`. **As imagens ficam no banco** (e não em pasta) porque cada deploy substitui a pasta da aplicação e apagaria arquivos gravados nela.
- `comunidade_atividades`: `id`, `post_id`, `user_id NULL` (SET NULL), `tipo VARCHAR(20)` (`criado`, `status`, `categoria`, `comentario`, `ocultado`), `detalhe VARCHAR(255) NULL` (para `status`: o novo status; para `categoria`: a nova categoria), `created_at`; índice em `post_id`.

**Contadores `votos` e `comentarios` em `comunidade_posts` são denormalizados**: atualize-os dentro de uma transação junto da inserção/remoção do voto/comentário. Alternativa aceitável: calcular com subconsulta; escolha uma e seja consistente.

---

## 4. Rotas (todas em `src/node/routes/index.js`, todas com `requireAuth`)

Caminho base: `/comunidade`. **Atenção à ordem das rotas:** declare `/comunidade/similares` e `/comunidade/anexo/:id` **antes** de `/comunidade/:id`.

| Método | Caminho | O que faz |
|---|---|---|
| GET | `/comunidade` | Lista (query: `orden=novo\|top\|tendencia` padrão `top`, `categoria=sugestao\|bug` opcional, `q` busca no título/descrição, `pagina` padrão 1, 15 por página, `minhas=1` filtra as do usuário) |
| GET | `/comunidade/similares?q=` | JSON com até 5 postagens parecidas (título `LIKE`, ignora ocultas) para evitar duplicatas |
| GET | `/comunidade/anexo/:id` | Serve a imagem (ver seção 6) |
| GET | `/comunidade/:id` | Detalhe. Com `?parcial=1` devolve **apenas o fragmento HTML** do conteúdo do modal (sem layout); sem o parâmetro, renderiza a página completa (para link direto/compartilhável) |
| POST | `/comunidade` | Cria postagem (multipart, campo de arquivos `imagens`) |
| POST | `/comunidade/:id/votar` | Alterna o voto. Responde JSON `{ votou: bool, votos: n }` |
| POST | `/comunidade/:id/importancia` | Define/remove nível. JSON |
| POST | `/comunidade/:id/seguir` | Alterna inscrição. JSON |
| POST | `/comunidade/:id/comentarios` | Cria comentário (multipart, campo `imagens`). Responde JSON com o HTML do comentário novo ou redireciona |
| POST | `/comunidade/:id/excluir` | Autor exclui a própria (regras da seção 2) |
| POST | `/comunidade/comentarios/:id/excluir` | Autor do comentário ou admin |
| POST | `/admin/comunidade/:id/estado` | Admin altera status (valida valor permitido; se `resolvido`, grava `resolvido_em`) |
| POST | `/admin/comunidade/:id/categoria` | Admin troca categoria |
| POST | `/admin/comunidade/:id/ocultar` | Admin oculta/desoculta |
| POST | `/admin/comunidade/:id/excluir` | Admin exclui definitivamente |

As rotas `/admin/comunidade/*` usam `requireAuth, exigirAdmin`. As de upload usam `multer` com `memoryStorage` e limites (`fileSize: 2 MB`, `files: 4`) — já existe uma instância `upload` no arquivo de rotas; crie outra específica com esses limites. Trate o erro do multer (`LIMIT_FILE_SIZE`, `LIMIT_UNEXPECTED_FILE`, etc.) devolvendo mensagem traduzida em vez de erro 500.

Adicione também, em `views/layout.ejs`, o link **Comunidade** (ícone `ph-users-three`) na barra de navegação (`navbar__links`) e na gaveta mobile (`drawer-links`), antes de "Configurações", marcando ativo quando `currentRoute.startsWith('/comunidade')`. Crie a chave `nav.comunidad` no seu arquivo de traduções (pt: "Comunidade", es: "Comunidad", en: "Community"); **não reutilize** a chave antiga `nav.comunidade`.

---

## 5. Telas (views EJS) e comportamento

Arquivos novos: `views/comunidade/index.ejs` (lista), `views/comunidade/_detalhe.ejs` (conteúdo do detalhe, usado como fragmento e na página completa), `views/comunidade/_card.ejs` (card da lista), `views/comunidade/_comentario.ejs`, `views/comunidade/detalhe.ejs` (página completa que inclui `_detalhe`). Use o layout padrão.

### 5.1 Lista (`/comunidade`)
- Cabeçalho com título e subtítulo traduzidos e botão **"Adicionar sugestão"** (abre o modal de nova postagem).
- Barra de filtros: botões de ordenação **Novo / Top / Em tendência** (o ativo destacado), campo de busca, filtro de categoria (Todas / Sugestões / Erros) e chip "Minhas postagens". Os filtros são links/`<form method="get">`; mantenha os parâmetros ao trocar de filtro.
- **Em tendência** = postagens com mais votos + comentários nos últimos 7 dias (use `comunidade_votos.created_at` e `comunidade_comentarios.created_at`); desempate por `created_at` desc. **Top** = mais votos. **Novo** = mais recentes.
- Cada **card** mostra: selo de status (cores: novo=neutro, em_analise=azul, planejado=roxo/azul, em_andamento=amarelo `--pendente`, resolvido=verde, recusado=vermelho — sempre com variáveis de tema e boa legibilidade no escuro), título, resumo da descrição (180 caracteres), selo da categoria, tempo relativo ("há 3 dias" — crie um helper simples traduzido: minutos/horas/dias/meses), nº de comentários e **botão de voto** (seta + contador, à direita, como no exemplo) que alterna o voto sem recarregar a página (fetch). Clicar no card abre o **modal de detalhe** (fetch de `/comunidade/:id?parcial=1`) e atualiza a URL com `history.pushState` (`/comunidade/:id`); fechar volta a URL anterior.
- Barra lateral (desktop; no mobile vai para baixo): "Suas postagens" (até 5 mais recentes do usuário, com status) e a lista de categorias com contagem.
- Paginação simples (anterior/próxima). Estado vazio traduzido e amigável.

### 5.2 Modal "Nova postagem"
- **Passo 1: escolha da categoria** (dois cartões grandes: "Sugestão de melhoria" e "Informar erro", com ícone e uma linha explicando cada um). A escolha define o restante do formulário.
- Campos: título, descrição, (se `bug`) "O que você esperava?" e o aviso de contexto; **seleção de imagens** (até 4) com **pré-visualização em miniaturas**, botão de remover cada uma, contador e mensagens de erro de tipo/tamanho **validadas no navegador antes de enviar** (mas o servidor valida de novo — a validação do navegador é só conveniência).
- Ao digitar o título (com debounce de 400 ms e mínimo de 4 caracteres) consulta `/comunidade/similares?q=` e mostra "Postagens parecidas" com links; o usuário pode seguir mesmo assim.
- Envio por `fetch` com `FormData`, header `X-CSRF-Token`, desabilitando o botão durante o envio (evita duplicidade) e, ao concluir, fecha o modal e abre o detalhe da nova postagem (ou recarrega a lista).

### 5.3 Detalhe (modal e página completa)
Layout em duas colunas no desktop (como a referência), uma coluna no mobile:
- **Coluna principal:** título, selo de categoria, descrição (com quebras de linha preservadas, texto escapado), galeria de miniaturas das imagens (clique abre ampliada em um visualizador simples), se `bug` mostra "O que esperava" quando houver; bloco **"Qual a importância disso para você?"** com 4 botões (o escolhido destacado); campo para **comentar** (textarea + anexar até 2 imagens + botão); abas **Comentários (n)** e **Feed de atividades**; lista de comentários (nome, selo "Equipe" quando for o caso, data, texto, imagens, botão excluir quando permitido).
- **Coluna lateral:** **Votantes** (botão de voto com contador), **Status** (selo), **Categoria**, **Data**, e o bloco **"Inscrever-se na postagem"** com botão **Ser notificado / Deixar de seguir**.
- **Se o usuário for admin**, mostrar um painel "Moderação": `<select>` de status + botão salvar, trocar categoria, botão ocultar/mostrar, botão excluir (com confirmação `data-confirm`), e a contagem por nível de importância.
- Se a postagem estiver `oculto = 1` e o usuário não for admin: responder 404. Se não existir: 404.

### 5.4 Qualidade de interface (obrigatório)
- Funciona em **tema claro e escuro** (somente variáveis CSS), em **mobile** (modal vira bottom sheet; alvos de toque ≥ 44px) e com **teclado** (modal fecha com `Esc`, foco volta ao botão que abriu, elementos clicáveis são `<button>`/`<a>`).
- Acessibilidade básica: `aria-label` traduzidos nos botões só com ícone, `role="dialog"` e `aria-modal="true"` no modal, imagens com `alt` traduzido.
- CSS novo em um bloco comentado no **final** de `public/assets/css/app.css` (`/* ---- Comunidade ---- */`), classes com prefixo `comunidade-`.

---

## 6. Segurança (partes críticas: escreva com muito cuidado e marque para revisão)

Crie estes pontos como módulos/funções **isolados e bem nomeados** e coloque o comentário `// REVISAR (seguranca):` acima de cada um, para eu encontrar rápido:

1. **`src/node/core/uploads.js`**: `validarImagem(buffer, mimeDeclarado)`.
   - Aceita **somente** PNG, JPEG, WebP e GIF, detectando o tipo pelos **primeiros bytes do arquivo** (assinatura/"magic number"), **ignorando** o `mimetype` e a extensão enviados pelo cliente. Recusa SVG, HTML e qualquer outro tipo.
   - Limite de 2 MB por arquivo e 4 (posts) / 2 (comentários) arquivos por envio.
   - Devolve `{ ok, mime, motivo }` onde o `mime` é o **detectado**, e é esse que se grava.
2. **`GET /comunidade/anexo/:id`**: exige login; busca o anexo; só serve se a postagem associada **não estiver oculta** (ou se o usuário for admin); envia `Content-Type` = mime gravado (já validado), `X-Content-Type-Options: nosniff`, `Content-Disposition: inline; filename="imagem"`, `Cache-Control: private, max-age=86400`, e `Content-Security-Policy: default-src 'none'; img-src 'self' data:; sandbox`.
3. **Autorização por ação** (no model, não só na rota): excluir postagem/comentário, ocultar, mudar status/categoria. Sempre valide no servidor quem é o autor/admin; nunca confie em campo oculto do formulário. Valores de `status`, `categoria`, `nivel` e `orden` devem ser validados contra listas permitidas (whitelist).
4. **XSS:** use sempre `<%= %>` (escapado) para texto de usuário. Só use `<%- %>` para HTML que **você** gera (por exemplo `csrfCampo`, ou fragmentos próprios). Não grave HTML. Não use `innerHTML` com texto do usuário no JS (use `textContent`/`createElement`); o fragmento HTML do detalhe e do comentário novo vem **renderizado pelo servidor** (já escapado).
5. **Limitação de taxa (anti-spam)** com `express-rate-limit` usando como chave o **id do usuário** (`keyGenerator: (req) => 'u' + (req.user && req.user.id)`), em arquivo `src/node/middleware/comunidadeLimites.js`: criar postagem **5 por hora**; comentar **30 por hora**; votar/importância/seguir **120 por hora**. Ao exceder, responda 429 (JSON para fetch) com mensagem traduzida.
6. **SQL:** apenas consultas parametrizadas. O `LIKE` da busca deve escapar `%` e `_` digitados pelo usuário. A ordenação (`orden`) escolhe entre trechos de SQL **fixos** do código, nunca interpola o valor recebido.
7. **Privacidade:** a função que monta o nome exibido (primeiro nome + inicial) fica em um único lugar e **nunca** inclui e-mail. Os resultados de consulta enviados às views/JSON não podem conter `email`, `senha_hash` nem tokens.
8. **Transações:** criar postagem + anexos + atividade + inscrição do autor numa única transação; criar comentário + anexos + atualização do contador + atividade também.

---

## 7. Traduções

Todas as chaves em `src/node/core/i18n_comunidade.js` no formato `'chave': ['pt-BR', 'es-PY', 'en-US']`. O espanhol (es-PY, Paraguai) é o idioma principal do público: capriche nele. Inclua textos de: menu, títulos/subtítulos, filtros, ordenações, status (6), categorias (2), importância (4), botões, placeholders, validações, avisos de contexto, estados vazios, tempo relativo, mensagens flash (`flash.comunidade_*`: postagem criada, comentário enviado, excluída, sem permissão, imagem inválida, imagem grande demais, limite de imagens, limite de envios atingido, não encontrada) e rótulos de acessibilidade. Depois de pronto, rode o script de verificação de chaves (seção 9) para garantir que **nenhuma chave usada está faltando** e que as três línguas têm as mesmas chaves.

---

## 8. Estrutura de arquivos esperada

```
database/migrations/0014_create_comunidade.sql
src/node/models/Comunidade.js              (consultas e regras; autorização no model)
src/node/controllers/comunidadeController.js
src/node/core/uploads.js                   // REVISAR (seguranca)
src/node/core/tempoRelativo.js             (helper de "há X dias", recebe t)
src/node/middleware/comunidadeLimites.js   // REVISAR (seguranca)
src/node/core/i18n_comunidade.js
views/comunidade/index.ejs
views/comunidade/_card.ejs
views/comunidade/_detalhe.ejs
views/comunidade/_comentario.ejs
views/comunidade/detalhe.ejs
public/assets/js/comunidade.js
public/assets/css/app.css                  (bloco novo no final)
views/layout.ejs                           (link no menu + <meta csrf-token> + carregar comunidade.js apenas nas páginas do módulo)
src/node/routes/index.js                   (rotas novas)
src/node/core/i18n.js                      (apenas registrar o novo arquivo de chaves)
```

Para carregar `comunidade.js` só no módulo, as views do módulo podem incluir a tag `<script src="/assets/js/comunidade.js?v=<%= Date.now() %>"></script>` no próprio final (como já faz `views/relatorios/index.ejs` com `charts.js`).

---

## 9. Como testar (obrigatório antes de entregar)

**Nunca** use o banco de produção. Há um MariaDB local (XAMPP) em `127.0.0.1:3307`, usuário `root`, **sem senha**. Se não estiver rodando, inicie-o (`C:\xampp\mysql\bin\mysqld.exe --defaults-file=C:\xampp\mysql\bin\my.ini`).

1. Crie um banco de teste **separado** copiando o de desenvolvimento (não altere o original `gestao_financeira`):
   ```
   mysql -uroot -P3307 -h127.0.0.1 -e "drop database if exists gf_test; create database gf_test character set utf8mb4;"
   mysqldump -uroot -P3307 -h127.0.0.1 gestao_financeira | mysql -uroot -P3307 -h127.0.0.1 gf_test
   ```
2. Suba o servidor apontando para ele (as variáveis de ambiente têm prioridade sobre o `.env`):
   ```
   DB_PORT=3307 DB_NAME=gf_test DB_USER=root DB_PASSWORD= PORT=3055 NODE_ENV=development SESSION_SECRET=teste node server.js
   ```
   A migration `0014` deve ser aplicada sozinha no start (confira o log "Migrations aplicadas"). Rode **duas vezes** para confirmar que a segunda não reaplica nada.
3. Escreva `scratch/test_comunidade.js` (script Node, sem dependências novas; use `fetch` nativo e `mysql2`) que cria usuários de teste direto no `gf_test` (senha com `bcryptjs`, `termos_versao='1.0'`, `termos_aceitos_em=NOW()`, e uma linha em `assinaturas` com `status='beta'` e o `plano_id` do plano `prueba`), faz login por HTTP mantendo cookies, extrai o `_csrf` do HTML (`name="_csrf" value="..."`) e cobre **pelo menos**:
   - lista abre (200) e mostra postagem criada; filtros/ordenações não geram erro 500;
   - criar postagem sugestão e bug (com e sem imagem), validações de tamanho de texto;
   - upload de PNG real aceito; arquivo `.svg`, arquivo `.html` renomeado `.png` e imagem > 2 MB **recusados**; mais de 4 imagens recusado;
   - votar duas vezes alterna e o contador fica correto; importância; seguir;
   - comentar (com e sem imagem); contador de comentários correto;
   - **autorização:** usuário comum **não** consegue mudar status, ocultar nem excluir postagem de outro (resposta de erro e nada muda no banco); admin consegue;
   - postagem oculta dá 404 para usuário comum e funciona para admin; anexo de postagem oculta não é servido a usuário comum;
   - `GET /comunidade/anexo/:id` devolve os cabeçalhos de segurança esperados;
   - texto com `<script>alert(1)</script>` no título/descrição/comentário aparece **escapado** no HTML;
   - rate limit: a 6ª postagem na hora devolve 429;
   - usuário com assinatura `vencida` consegue **ler** (GET 200) mas POST é bloqueado;
   - sem login, tudo redireciona para `/login`.
4. Rode também um verificador de chaves de tradução: um script que percorre `views/` e `src/node/` procurando `t('...')` e confirma que cada chave existe em pt-BR, es-PY e en-US, e que as views compilam (`ejs.compile`).
5. Ao terminar: pare o servidor, **apague o banco `gf_test`** e deixe `scratch/test_comunidade.js` no repositório.

---

## 10. Entrega (formato do seu relatório final)

Responda com:
1. Lista dos arquivos criados e alterados (com uma linha sobre cada um).
2. Resultado do teste da seção 9 (quantos passaram/falharam; cole as falhas, se houver).
3. **Todos os pontos marcados `// REVISAR`** (arquivo e linha) e um resumo do que cada um faz.
4. Decisões que você precisou tomar por conta própria e dúvidas.
5. O que ficou **fora** (ex.: e-mails de notificação, aba "Atualizações", edição de postagem) — confirme que **nada disso** foi implementado.

**Critérios de pronto:** migration aplica em banco novo e em banco existente sem erro e sem alterar tabelas antigas; todas as rotas exigem login; nenhum texto fixo nas views/JS/controllers; tema escuro e mobile funcionando; nenhum e-mail de usuário exposto; todas as consultas parametrizadas; testes da seção 9 passando.
