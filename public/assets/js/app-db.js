// Wrapper leve de IndexedDB para armanazenamento offline seguro do MyFinance
(function(exports) {
    const DB_NAME = 'MyFinanceDB';
    const DB_VERSION = 2;
    let dbInstance = null;

    function gerarUUID() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    function abrir() {
        if (dbInstance) return Promise.resolve(dbInstance);
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) {
                return reject(new Error('IndexedDB não suportado neste navegador.'));
            }
            const request = window.indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                if (!db.objectStoreNames.contains('contas')) {
                    const store = db.createObjectStore('contas', { keyPath: 'client_or_id' });
                    store.createIndex('idx_user', 'user_id', { unique: false });
                    store.createIndex('idx_id', 'id', { unique: false });
                }
                if (!db.objectStoreNames.contains('categorias')) {
                    const store = db.createObjectStore('categorias', { keyPath: 'client_or_id' });
                    store.createIndex('idx_user', 'user_id', { unique: false });
                }
                if (!db.objectStoreNames.contains('lancamentos')) {
                    const store = db.createObjectStore('lancamentos', { keyPath: 'client_or_id' });
                    store.createIndex('idx_user', 'user_id', { unique: false });
                    store.createIndex('idx_conta', 'conta_id', { unique: false });
                    store.createIndex('idx_data', 'data_competencia', { unique: false });
                }
                if (!db.objectStoreNames.contains('meta')) {
                    db.createObjectStore('meta', { keyPath: 'chave' });
                }
                if (!db.objectStoreNames.contains('fila')) {
                    const store = db.createObjectStore('fila', { keyPath: 'op_id' });
                    store.createIndex('idx_estado', 'estado', { unique: false });
                    store.createIndex('idx_ordem', 'ordem', { unique: false });
                }
                if (!db.objectStoreNames.contains('outbox')) {
                    const store = db.createObjectStore('outbox', { keyPath: 'id' });
                    store.createIndex('idx_status', 'status', { unique: false });
                    store.createIndex('idx_client_id', 'client_id', { unique: false });
                    store.createIndex('idx_criado_em', 'criado_em', { unique: false });
                }
            };

            request.onsuccess = (event) => {
                dbInstance = event.target.result;
                resolve(dbInstance);
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    function getKey(item) {
        return item.client_id || (item.id ? `id_${item.id}` : `temp_${Date.now()}_${Math.random()}`);
    }

    function salvarItens(storeName, itens) {
        return abrir().then((db) => {
            return new Promise((resolve, reject) => {
                const tx = db.transaction(storeName, 'readwrite');
                const store = tx.objectStore(storeName);
                (itens || []).forEach((item) => {
                    item.client_or_id = getKey(item);
                    if (item.deleted_at) {
                        store.delete(item.client_or_id);
                    } else {
                        store.put(item);
                    }
                });
                tx.oncomplete = () => resolve(true);
                tx.onerror = (err) => reject(err.target.error);
            });
        });
    }

    function buscarTodos(storeName) {
        return abrir().then((db) => {
            return new Promise((resolve, reject) => {
                const tx = db.transaction(storeName, 'readonly');
                const store = tx.objectStore(storeName);
                const req = store.getAll();
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = (err) => reject(err.target.error);
            });
        });
    }

    function salvarMeta(chave, valor) {
        return abrir().then((db) => {
            return new Promise((resolve, reject) => {
                const tx = db.transaction('meta', 'readwrite');
                tx.objectStore('meta').put({ chave, valor, updated_at: new Date().toISOString() });
                tx.oncomplete = () => resolve(true);
                tx.onerror = (err) => reject(err.target.error);
            });
        });
    }

    function obterMeta(chave) {
        return abrir().then((db) => {
            return new Promise((resolve) => {
                const tx = db.transaction('meta', 'readonly');
                const req = tx.objectStore('meta').get(chave);
                req.onsuccess = () => resolve(req.result ? req.result.valor : null);
                req.onerror = () => resolve(null);
            });
        });
    }

    // Copias provisorias que o aparelho mostra ate o servidor confirmar (valor ja com sinal, como no servidor).
    function provisorios(op, clientId) {
        const d = op.dados || {};
        const num = (v) => Number(v);
        if (op.tabela === 'lancamentos' && op.acao === 'create') {
            const v = Math.abs(num(d.valor));
            return [{
                client_id: clientId, client_or_id: clientId, conta_id: num(d.conta_id), categoria_id: d.categoria_id ? num(d.categoria_id) : null,
                tipo: d.tipo, descricao: d.descricao, valor: d.tipo === 'despesa' ? -v : v, status: d.status, data_competencia: d.data_competencia,
                data_pagamento: d.status === 'pago' ? (d.data_pagamento || d.data_competencia) : null, observacoes: d.observacoes || null, pendente_sync: true
            }];
        }
        if (op.tabela === 'lancamentos' && (op.acao === 'transferir' || op.acao === 'agendar_transferencia')) {
            const v = Math.abs(num(d.valor));
            const agendada = op.acao === 'agendar_transferencia';
            const base = { tipo: 'transferencia', status: agendada ? 'pendente' : 'pago', data_competencia: d.data, data_pagamento: agendada ? null : d.data, pendente_sync: true, categoria_id: null };
            return [
                Object.assign({ client_id: clientId, client_or_id: clientId, conta_id: num(d.conta_origem_id), descricao: d.descricao || 'Transferência', valor: -v }, base),
                Object.assign({ client_or_id: clientId + ':in', conta_id: num(d.conta_destino_id), descricao: d.descricao || 'Transferência', valor: v }, base)
            ];
        }
        return [];
    }

    // Enfileira uma operacao feita sem internet e grava a copia provisoria na mesma transacao.
    // acoes: create | pagar | transferir (tabela "lancamentos")
    function adicionarOutbox(op) {
        const clientId = op.client_id || gerarUUID();
        const item = {
            id: op.id || `out_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            client_id: clientId, tabela: op.tabela, acao: op.acao, dados: op.dados || {},
            resumo: op.resumo || null, status: 'pending', tentativas: 0, criado_em: new Date().toISOString(), erro: null, desfazer: null
        };
        return abrir().then((db) => new Promise((resolve, reject) => {
            const tx = db.transaction(['outbox', 'lancamentos', 'categorias'], 'readwrite');
            const lanc = tx.objectStore('lancamentos');
            provisorios(op, clientId).forEach((p) => lanc.put(p));
            if (op.tabela === 'categorias' && op.acao === 'create') {
                const d = op.dados;
                tx.objectStore('categorias').put({ client_id: clientId, client_or_id: clientId, nome: d.nome, cor: d.cor || '#3b82f6', parent_id: d.parent_id || null, limite_gasto: d.limite_gasto || null, status: 'ativa', sistema: 0, pendente_sync: true });
            }
            if (op.tabela === 'lancamentos' && op.acao === 'pagar') {
                const chave = `id_${Number(item.dados.id)}`;
                const get = lanc.get(chave);
                get.onsuccess = () => {
                    const atual = get.result;
                    if (atual) {
                        item.desfazer = { chave, status: atual.status, data_pagamento: atual.data_pagamento || null, pendente_sync: !!atual.pendente_sync };
                        const pago = item.dados.status !== 'pendente';
                        lanc.put(Object.assign({}, atual, { status: pago ? 'pago' : 'pendente', data_pagamento: pago ? (item.dados.data_pagamento || null) : null, pendente_sync: true }));
                    }
                    tx.objectStore('outbox').put(item);
                };
            } else {
                tx.objectStore('outbox').put(item);
            }
            tx.oncomplete = () => resolve(item);
            tx.onerror = (err) => reject(err.target.error);
        }));
    }

    // Remove o item da fila e as copias provisorias que sobraram (a perna "entrada" da transferencia nao volta no pull com a mesma chave).
    function concluirOutbox(item) {
        return abrir().then((db) => new Promise((resolve, reject) => {
            const tx = db.transaction(['outbox', 'lancamentos'], 'readwrite');
            tx.objectStore('outbox').delete(item.id);
            if (item.acao === 'transferir' || item.acao === 'agendar_transferencia') tx.objectStore('lancamentos').delete(item.client_id + ':in');
            tx.oncomplete = () => resolve(true);
            tx.onerror = (err) => reject(err.target.error);
        }));
    }

    // O usuario desistiu da operacao: tira da fila e desfaz a copia provisoria.
    function descartarOutbox(item) {
        return abrir().then((db) => new Promise((resolve, reject) => {
            const tx = db.transaction(['outbox', 'lancamentos', 'categorias'], 'readwrite');
            const lanc = tx.objectStore('lancamentos');
            tx.objectStore('outbox').delete(item.id);
            if (item.tabela === 'categorias') { tx.objectStore('categorias').delete(item.client_id); }
            if (item.acao === 'create' && item.tabela === 'lancamentos') lanc.delete(item.client_id);
            if (item.acao === 'transferir' || item.acao === 'agendar_transferencia') { lanc.delete(item.client_id); lanc.delete(item.client_id + ':in'); }
            if (item.acao === 'pagar' && item.desfazer) {
                const get = lanc.get(item.desfazer.chave);
                get.onsuccess = () => {
                    if (get.result) lanc.put(Object.assign({}, get.result, { status: item.desfazer.status, data_pagamento: item.desfazer.data_pagamento, pendente_sync: item.desfazer.pendente_sync }));
                };
            }
            tx.oncomplete = () => resolve(true);
            tx.onerror = (err) => reject(err.target.error);
        }));
    }

    // Ultimos envios concluidos (ou recusados): fica guardado para o usuario conferir o que o servidor respondeu.
    function registrarHistorico(entrada) {
        return obterMeta('historico_envios').then((lista) => {
            const nova = [Object.assign({ em: new Date().toISOString() }, entrada)].concat(Array.isArray(lista) ? lista : []).slice(0, 20);
            return salvarMeta('historico_envios', nova);
        });
    }

    // Toda a fila (para a tela "Aguardando envio"), da mais antiga para a mais nova.
    function listarOutbox() {
        return abrir().then((db) => new Promise((resolve, reject) => {
            const req = db.transaction('outbox', 'readonly').objectStore('outbox').getAll();
            req.onsuccess = () => resolve((req.result || []).sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em)));
            req.onerror = (err) => reject(err.target.error);
        }));
    }

    function buscarOutboxPendentes() {
        return abrir().then((db) => {
            return new Promise((resolve, reject) => {
                const tx = db.transaction('outbox', 'readonly');
                const store = tx.objectStore('outbox');
                const req = store.getAll();
                req.onsuccess = () => {
                    const todos = req.result || [];
                    const pendentes = todos.filter((i) => i.status === 'pending' || i.status === 'syncing');
                    pendentes.sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em));
                    resolve(pendentes);
                };
                req.onerror = (err) => reject(err.target.error);
            });
        });
    }

    // Operacoes que o servidor recusou ou que conflitaram: ficam na fila ate o usuario resolver (nao sao reenviadas sozinhas).
    function buscarOutboxComProblema() {
        return abrir().then((db) => new Promise((resolve, reject) => {
            const req = db.transaction('outbox', 'readonly').objectStore('outbox').getAll();
            req.onsuccess = () => resolve((req.result || []).filter((i) => i.status === 'rejected' || i.status === 'conflict'));
            req.onerror = (err) => reject(err.target.error);
        }));
    }

    // Apaga copias locais de registros excluidos no servidor: [{ tabela, id, client_id }]
    function removerExcluidos(exclusoes) {
        return abrir().then((db) => new Promise((resolve, reject) => {
            const tx = db.transaction(['contas', 'categorias', 'lancamentos'], 'readwrite');
            (exclusoes || []).forEach((e) => {
                if (!['contas', 'categorias', 'lancamentos'].includes(e.tabela)) return;
                const store = tx.objectStore(e.tabela);
                if (e.client_id) store.delete(e.client_id);
                store.delete(`id_${e.id}`);
            });
            tx.oncomplete = () => resolve(true);
            tx.onerror = (err) => reject(err.target.error);
        }));
    }

    function atualizarOutboxItem(id, updates) {
        return abrir().then((db) => {
            return new Promise((resolve, reject) => {
                const tx = db.transaction('outbox', 'readwrite');
                const store = tx.objectStore('outbox');
                const getReq = store.get(id);
                getReq.onsuccess = () => {
                    if (getReq.result) {
                        const obj = Object.assign({}, getReq.result, updates);
                        store.put(obj);
                    }
                };
                tx.oncomplete = () => resolve(true);
                tx.onerror = (err) => reject(err.target.error);
            });
        });
    }

    function removerOutboxItem(id) {
        return abrir().then((db) => {
            return new Promise((resolve, reject) => {
                const tx = db.transaction('outbox', 'readwrite');
                tx.objectStore('outbox').delete(id);
                tx.oncomplete = () => resolve(true);
                tx.onerror = (err) => reject(err.target.error);
            });
        });
    }

    function limparTudo() {
        return abrir().then((db) => {
            return new Promise((resolve, reject) => {
                const stores = ['contas', 'categorias', 'lancamentos', 'meta', 'fila', 'outbox'];
                const tx = db.transaction(stores, 'readwrite');
                stores.forEach((s) => {
                    if (db.objectStoreNames.contains(s)) {
                        tx.objectStore(s).clear();
                    }
                });
                tx.oncomplete = () => resolve(true);
                tx.onerror = (err) => reject(err.target.error);
            });
        });
    }

    exports.abrir = abrir;
    exports.gerarUUID = gerarUUID;
    exports.salvarItens = salvarItens;
    exports.buscarTodos = buscarTodos;
    exports.salvarMeta = salvarMeta;
    exports.obterMeta = obterMeta;
    exports.adicionarOutbox = adicionarOutbox;
    exports.buscarOutboxPendentes = buscarOutboxPendentes;
    exports.atualizarOutboxItem = atualizarOutboxItem;
    exports.removerOutboxItem = removerOutboxItem;
    exports.limparTudo = limparTudo;
    exports.registrarHistorico = registrarHistorico;
    exports.concluirOutbox = concluirOutbox;
    exports.descartarOutbox = descartarOutbox;
    exports.listarOutbox = listarOutbox;
    exports.buscarOutboxComProblema = buscarOutboxComProblema;
    exports.removerExcluidos = removerExcluidos;

})(typeof exports !== 'undefined' ? exports : (window.AppDb = {}));
