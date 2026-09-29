<?php

namespace App\Models;

use PDO;

/**
 * Modelo do ledger de lancamentos. Alem dos lancamentos automaticos de
 * ajuste de saldo e transferencia (gerados em Contas Bancarias), a partir
 * da Fase 3 (Painel Inicial) tambem cobre o CRUD de lancamentos manuais
 * (tipo receita/despesa) e as consultas usadas no dashboard.
 */
class Lancamento
{
    /** Unicos tipos que o usuario pode criar/editar/excluir manualmente pelo Painel. */
    public const TIPOS_MANUAIS = ['receita', 'despesa'];

    /**
     * Historico de operacoes de uma conta especifica, mais recente primeiro.
     * Usado na tela de Extrato (Contas Bancarias).
     */
    public static function listarPorConta(PDO $pdo, int $userId, int $contaId): array
    {
        $stmt = $pdo->prepare(
            'SELECT * FROM lancamentos
             WHERE user_id = :user_id AND conta_id = :conta_id
             ORDER BY data_competencia DESC, id DESC'
        );
        $stmt->execute(['user_id' => $userId, 'conta_id' => $contaId]);
        return $stmt->fetchAll();
    }

    /**
     * Todos os lancamentos do usuario (qualquer tipo/status), sem joins.
     * Usado pela exportacao de backup (Configuracoes > Dados).
     */
    public static function listarTodosDoUsuario(PDO $pdo, int $userId): array
    {
        $stmt = $pdo->prepare('SELECT * FROM lancamentos WHERE user_id = :user_id ORDER BY id ASC');
        $stmt->execute(['user_id' => $userId]);
        return $stmt->fetchAll();
    }

    /**
     * Busca um lancamento pelo id (qualquer tipo), ja trazendo nome/cor da
     * conta e da categoria (join). Usado pelo Painel para exibir/editar.
     */
    public static function buscarPorId(PDO $pdo, int $userId, int $id): ?array
    {
        $stmt = $pdo->prepare(
            'SELECT l.*, c.nome AS conta_nome, c.cor AS conta_cor,
                    cat.nome AS categoria_nome, cat.cor AS categoria_cor, cat.parent_id AS categoria_parent_id
             FROM lancamentos l
             JOIN contas c ON c.id = l.conta_id
             LEFT JOIN categorias cat ON cat.id = l.categoria_id
             WHERE l.id = :id AND l.user_id = :user_id
             LIMIT 1'
        );
        $stmt->execute(['id' => $id, 'user_id' => $userId]);
        $lancamento = $stmt->fetch();
        return $lancamento ?: null;
    }

    /**
     * Lancamentos (de qualquer tipo) num periodo, mais recentes primeiro
     * (ou maior valor absoluto primeiro, se $ordenacao = 'valor'), com nome/
     * cor da conta e da categoria (LEFT JOIN pois categoria pode ser nula).
     * Filtros opcionais: tipo ('receitas'|'despesas'|'todas') e busca
     * (descricao LIKE). Paginado (LIMIT/OFFSET) - use contarPorPeriodo() com
     * os mesmos filtros para saber o total de registros/paginas.
     *
     * $pagina/$porPagina sao bindados explicitamente como PDO::PARAM_INT: o
     * PDO, ao vincular via execute(array), trata todo valor como string por
     * padrao, e MySQL nao aceita literais de string em LIMIT/OFFSET (a
     * "pegadinha" classica de LIMIT/OFFSET com prepared statements).
     */
    public static function listarPorPeriodo(
        PDO $pdo,
        int $userId,
        string $dataInicio,
        string $dataFim,
        array $filtros = [],
        string $ordenacao = 'data',
        int $pagina = 1,
        int $porPagina = 30
    ): array {
        $condicoes = ['l.user_id = :user_id', 'l.data_competencia BETWEEN :inicio AND :fim'];
        $params = ['user_id' => $userId, 'inicio' => $dataInicio, 'fim' => $dataFim];

        $tipo = $filtros['tipo'] ?? 'todas';
        if ($tipo === 'receitas') {
            $condicoes[] = "l.tipo = 'receita'";
        } elseif ($tipo === 'despesas') {
            $condicoes[] = "l.tipo = 'despesa'";
        }

        if (!empty($filtros['busca'])) {
            $condicoes[] = 'l.descricao LIKE :busca';
            $params['busca'] = '%' . $filtros['busca'] . '%';
        }

        // 'valor' ordena pelo valor absoluto (do maior para o menor gasto/
        // receita, sem que despesas - guardadas com sinal negativo - fiquem
        // sempre por ultimo); data_competencia/id seguem como desempate e
        // como ordenacao padrao (comportamento anterior, inalterado).
        $orderBy = $ordenacao === 'valor'
            ? 'ABS(l.valor) DESC, l.data_competencia DESC, l.id DESC'
            : 'l.data_competencia DESC, l.id DESC';

        $porPagina = max(1, $porPagina);
        $offset = (max(1, $pagina) - 1) * $porPagina;

        $sql = 'SELECT l.*, c.nome AS conta_nome, c.cor AS conta_cor,
                       cat.nome AS categoria_nome, cat.cor AS categoria_cor, cat.parent_id AS categoria_parent_id
                FROM lancamentos l
                JOIN contas c ON c.id = l.conta_id
                LEFT JOIN categorias cat ON cat.id = l.categoria_id
                WHERE ' . implode(' AND ', $condicoes) . '
                ORDER BY ' . $orderBy . '
                LIMIT :limite OFFSET :offset';

        // PDO nao deixa misturar bindValue() com passar o array direto pra
        // execute() no mesmo statement (gera "SQLSTATE[HY093]: Invalid
        // parameter number" - documentado no proprio manual do PHP). Como
        // :limite/:offset PRECISAM ser bindados explicitamente como
        // PDO::PARAM_INT (LIMIT/OFFSET nao aceita literal de string), os
        // demais parametros tambem sao bindados um a um aqui, e execute()
        // roda sem argumentos.
        $stmt = $pdo->prepare($sql);
        foreach ($params as $chave => $valor) {
            $stmt->bindValue(':' . $chave, $valor);
        }
        $stmt->bindValue(':limite', $porPagina, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }

    /**
     * Conta quantos lancamentos um periodo tem, com os mesmos filtros de
     * listarPorPeriodo() (tipo/busca), para calcular o total de paginas.
     */
    public static function contarPorPeriodo(PDO $pdo, int $userId, string $dataInicio, string $dataFim, array $filtros = []): int
    {
        $condicoes = ['user_id = :user_id', 'data_competencia BETWEEN :inicio AND :fim'];
        $params = ['user_id' => $userId, 'inicio' => $dataInicio, 'fim' => $dataFim];

        $tipo = $filtros['tipo'] ?? 'todas';
        if ($tipo === 'receitas') {
            $condicoes[] = "tipo = 'receita'";
        } elseif ($tipo === 'despesas') {
            $condicoes[] = "tipo = 'despesa'";
        }

        if (!empty($filtros['busca'])) {
            $condicoes[] = 'descricao LIKE :busca';
            $params['busca'] = '%' . $filtros['busca'] . '%';
        }

        $stmt = $pdo->prepare('SELECT COUNT(*) FROM lancamentos WHERE ' . implode(' AND ', $condicoes));
        $stmt->execute($params);
        return (int) $stmt->fetchColumn();
    }

    /**
     * Resumo financeiro de um periodo para os cards do Painel: saldo antes
     * do periodo, receitas/despesas pagas e pendentes dentro do periodo, e
     * saldo disponivel/previsto (esses dois sempre "hoje", nao presos ao
     * periodo navegado).
     */
    public static function resumoPeriodo(PDO $pdo, int $userId, string $dataInicio, string $dataFim): array
    {
        $stmt = $pdo->prepare("SELECT COALESCE(SUM(saldo_inicial), 0) FROM contas WHERE user_id = :user_id AND status = 'ativa'");
        $stmt->execute(['user_id' => $userId]);
        $saldoInicialContas = (float) $stmt->fetchColumn();

        $stmt = $pdo->prepare(
            "SELECT COALESCE(SUM(l.valor), 0) FROM lancamentos l
             INNER JOIN contas c ON c.id = l.conta_id
             WHERE l.user_id = :user_id AND c.status = 'ativa' AND l.status = 'pago' AND l.data_competencia < :inicio"
        );
        $stmt->execute(['user_id' => $userId, 'inicio' => $dataInicio]);
        $lancamentosAntesDoPeriodo = (float) $stmt->fetchColumn();

        $agregado = static function (string $tipo, string $status) use ($pdo, $userId, $dataInicio, $dataFim): float {
            $stmt = $pdo->prepare(
                "SELECT COALESCE(SUM(ABS(valor)), 0) FROM lancamentos
                 WHERE user_id = :user_id AND tipo = :tipo AND status = :status
                   AND data_competencia BETWEEN :inicio AND :fim"
            );
            $stmt->execute(['user_id' => $userId, 'tipo' => $tipo, 'status' => $status, 'inicio' => $dataInicio, 'fim' => $dataFim]);
            return (float) $stmt->fetchColumn();
        };

        $receitasAReceber = $agregado('receita', 'pendente');
        $despesasNaoPagas = $agregado('despesa', 'pendente');
        $saldoDisponivel = Conta::saldoTotal($pdo, $userId);

        return [
            'saldo_anterior'     => $saldoInicialContas + $lancamentosAntesDoPeriodo,
            'receitas_recebidas' => $agregado('receita', 'pago'),
            'receitas_a_receber' => $receitasAReceber,
            'despesas_pagas'     => $agregado('despesa', 'pago'),
            'despesas_nao_pagas' => $despesasNaoPagas,
            'saldo_disponivel'   => $saldoDisponivel,
            'saldo_previsto'     => $saldoDisponivel + $receitasAReceber - $despesasNaoPagas,
        ];
    }

    /**
     * Total de despesas (valor absoluto, pagas + pendentes) de um mes/ano
     * especifico - usado pela faixa horizontal de meses do Painel Inicial
     * (janela de 11 meses ao redor do periodo navegado).
     */
    public static function totalDespesasMes(PDO $pdo, int $userId, int $mes, int $ano): float
    {
        $stmt = $pdo->prepare(
            "SELECT COALESCE(SUM(ABS(valor)), 0) FROM lancamentos
             WHERE user_id = :user_id AND tipo = 'despesa'
               AND MONTH(data_competencia) = :mes AND YEAR(data_competencia) = :ano"
        );
        $stmt->execute(['user_id' => $userId, 'mes' => $mes, 'ano' => $ano]);
        return (float) $stmt->fetchColumn();
    }

    /**
     * Cria um lancamento manual (receita ou despesa). $dados['valor'] vem
     * sempre positivo (digitado pelo usuario); o sinal e aplicado aqui
     * seguindo a mesma convencao de criarTransferencia() - positivo entra
     * na conta, negativo sai.
     */
    public static function criar(PDO $pdo, int $userId, array $dados): int
    {
        return self::inserirLinha($pdo, $userId, $dados);
    }

    /**
     * Cria $quantidade lancamentos manuais (o original + N-1 copias), cada
     * um com data_competencia/data_pagamento deslocadas em +0, +1, +2... N-1
     * meses a partir das datas originais de $dados. Usado pelo toggle
     * "Repetir Transacao" do modal de criacao (nunca na edicao).
     *
     * Deslocamento de mes via strtotime('+N month', ...): quando o dia da
     * data original nao existe no mes de destino (ex.: dia 31 e o mes
     * seguinte so tem 30 dias), o PHP "transborda" para o mes seguinte
     * (31 jan + 1 mes = 3 mar, nao 28/29 fev) - e o comportamento nativo do
     * strtotime, documentado aqui para quem for depurar uma data
     * "estranha" gerada por essa funcao.
     *
     * Roda em transacao: se qualquer insercao falhar, nenhum lancamento da
     * serie fica gravado.
     *
     * @return int[] ids dos lancamentos criados, na ordem (mes 0, 1, 2...).
     */
    public static function gerarUuid(): string
    {
        $data = random_bytes(16);
        $data[6] = chr(ord($data[6]) & 0x0f | 0x40);
        $data[8] = chr(ord($data[8]) & 0x3f | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }

    public static function criarComRepeticao(PDO $pdo, int $userId, array $dados, int $quantidade): array
    {
        $ids = [];
        $serieId = self::gerarUuid();

        $pdo->beginTransaction();
        try {
            for ($i = 0; $i < $quantidade; $i++) {
                $linha = $dados;
                $linha['serie_id'] = $serieId;
                $linha['recorrente'] = 1;
                $linha['data_competencia'] = self::somarMeses($dados['data_competencia'], $i);
                $linha['data_pagamento'] = $dados['data_pagamento'] !== null
                    ? self::somarMeses($dados['data_pagamento'], $i)
                    : null;

                $ids[] = self::inserirLinha($pdo, $userId, $linha);
            }

            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }

        return $ids;
    }

    private static function somarMeses(string $data, int $meses): string
    {
        if ($meses === 0) {
            return $data;
        }
        return date('Y-m-d', strtotime("+{$meses} month", strtotime($data)));
    }

    private static function inserirLinha(PDO $pdo, int $userId, array $dados): int
    {
        $valor = $dados['tipo'] === 'despesa' ? -abs($dados['valor']) : abs($dados['valor']);
        $serieId = $dados['serie_id'] ?? null;

        $stmt = $pdo->prepare(
            'INSERT INTO lancamentos (user_id, serie_id, conta_id, categoria_id, tipo, descricao, valor, data_competencia, data_pagamento, status, recorrente, observacoes)
             VALUES (:user_id, :serie_id, :conta_id, :categoria_id, :tipo, :descricao, :valor, :data_competencia, :data_pagamento, :status, :recorrente, :observacoes)'
        );
        $stmt->execute([
            'user_id'          => $userId,
            'serie_id'         => $serieId,
            'conta_id'         => $dados['conta_id'],
            'categoria_id'     => $dados['categoria_id'],
            'tipo'             => $dados['tipo'],
            'descricao'        => $dados['descricao'],
            'valor'            => $valor,
            'data_competencia' => $dados['data_competencia'],
            'data_pagamento'   => $dados['data_pagamento'],
            'status'           => $dados['status'],
            'recorrente'       => !empty($dados['recorrente']) ? 1 : 0,
            'observacoes'      => $dados['observacoes'],
        ]);

        return (int) $pdo->lastInsertId();
    }

    /**
     * Atualiza um lancamento manual existente. Suporta os escopos:
     * - apenas_esta: edita somente a linha informada.
     * - esta_e_proximas: edita a linha informada e todas as seguintes da mesma serie.
     * - toda_serie: edita todas as linhas da serie (datas nao sao alteradas).
     */
    public static function atualizar(PDO $pdo, int $userId, int $id, array $dados, string $escopo = 'apenas_esta'): void
    {
        $atual = self::buscarPorId($pdo, $userId, $id);
        if (!$atual) {
            return;
        }

        $serieId = $atual['serie_id'] ?? null;
        if (!$serieId || $escopo === 'apenas_esta') {
            self::atualizarLinhaUnica($pdo, $userId, $id, $dados);
            return;
        }

        if ($escopo === 'esta_e_proximas') {
            self::atualizarEstaEProximas($pdo, $userId, $id, $serieId, $atual['data_competencia'], $dados);
            return;
        }

        if ($escopo === 'toda_serie') {
            self::atualizarTodaASerie($pdo, $userId, $serieId, $dados);
            return;
        }

        self::atualizarLinhaUnica($pdo, $userId, $id, $dados);
    }

    private static function atualizarLinhaUnica(PDO $pdo, int $userId, int $id, array $dados): void
    {
        $valor = $dados['tipo'] === 'despesa' ? -abs($dados['valor']) : abs($dados['valor']);

        $stmt = $pdo->prepare(
            "UPDATE lancamentos
             SET conta_id = :conta_id, categoria_id = :categoria_id, tipo = :tipo, descricao = :descricao,
                 valor = :valor, data_competencia = :data_competencia, data_pagamento = :data_pagamento,
                 status = :status, recorrente = :recorrente, observacoes = :observacoes
             WHERE id = :id AND user_id = :user_id AND tipo IN ('receita', 'despesa')"
        );
        $stmt->execute([
            'conta_id'         => $dados['conta_id'],
            'categoria_id'     => $dados['categoria_id'],
            'tipo'             => $dados['tipo'],
            'descricao'        => $dados['descricao'],
            'valor'            => $valor,
            'data_competencia' => $dados['data_competencia'],
            'data_pagamento'   => $dados['data_pagamento'],
            'status'           => $dados['status'],
            'recorrente'       => !empty($dados['recorrente']) ? 1 : 0,
            'observacoes'      => $dados['observacoes'],
            'id'               => $id,
            'user_id'          => $userId,
        ]);
    }

    private static function atualizarEstaEProximas(PDO $pdo, int $userId, int $id, string $serieId, string $targetData, array $dados): void
    {
        $valor = $dados['tipo'] === 'despesa' ? -abs($dados['valor']) : abs($dados['valor']);

        $stmt = $pdo->prepare(
            "UPDATE lancamentos
             SET conta_id = :conta_id, categoria_id = :categoria_id, tipo = :tipo, descricao = :descricao,
                 valor = :valor, status = :status, recorrente = :recorrente, observacoes = :observacoes
             WHERE user_id = :user_id AND serie_id = :serie_id AND data_competencia >= :target_data AND tipo IN ('receita', 'despesa')"
        );
        $stmt->execute([
            'conta_id'    => $dados['conta_id'],
            'categoria_id'=> $dados['categoria_id'],
            'tipo'        => $dados['tipo'],
            'descricao'   => $dados['descricao'],
            'valor'       => $valor,
            'status'      => $dados['status'],
            'recorrente'  => !empty($dados['recorrente']) ? 1 : 0,
            'observacoes' => $dados['observacoes'],
            'user_id'     => $userId,
            'serie_id'    => $serieId,
            'target_data' => $targetData,
        ]);
    }

    private static function atualizarTodaASerie(PDO $pdo, int $userId, string $serieId, array $dados): void
    {
        $valor = $dados['tipo'] === 'despesa' ? -abs($dados['valor']) : abs($dados['valor']);

        $stmt = $pdo->prepare(
            "UPDATE lancamentos
             SET conta_id = :conta_id, categoria_id = :categoria_id, tipo = :tipo, descricao = :descricao,
                 valor = :valor, status = :status, recorrente = :recorrente, observacoes = :observacoes
             WHERE user_id = :user_id AND serie_id = :serie_id AND tipo IN ('receita', 'despesa')"
        );
        $stmt->execute([
            'conta_id'    => $dados['conta_id'],
            'categoria_id'=> $dados['categoria_id'],
            'tipo'        => $dados['tipo'],
            'descricao'   => $dados['descricao'],
            'valor'       => $valor,
            'status'      => $dados['status'],
            'recorrente'  => !empty($dados['recorrente']) ? 1 : 0,
            'observacoes' => $dados['observacoes'],
            'user_id'     => $userId,
            'serie_id'    => $serieId,
        ]);
    }


    /**
     * Exclui (hard delete) um lancamento manual. So afeta linhas com
     * tipo IN ('receita','despesa').
     */
    public static function excluir(PDO $pdo, int $userId, int $id, string $escopo = 'apenas_esta'): void
    {
        $item = self::buscarPorId($pdo, $userId, $id);
        if (!$item) {
            return;
        }

        $serieId = $item['serie_id'] ?? null;
        if ($serieId !== null && $escopo !== 'apenas_esta') {
            if ($escopo === 'esta_e_proximas') {
                $stmt = $pdo->prepare("DELETE FROM lancamentos WHERE user_id = :user_id AND serie_id = :serie_id AND data_competencia >= :target_data AND tipo IN ('receita', 'despesa')");
                $stmt->execute(['user_id' => $userId, 'serie_id' => $serieId, 'target_data' => $item['data_competencia']]);
                return;
            }
            if ($escopo === 'toda_serie') {
                $stmt = $pdo->prepare("DELETE FROM lancamentos WHERE user_id = :user_id AND serie_id = :serie_id AND tipo IN ('receita', 'despesa')");
                $stmt->execute(['user_id' => $userId, 'serie_id' => $serieId]);
                return;
            }
        }

        $stmt = $pdo->prepare("DELETE FROM lancamentos WHERE id = :id AND user_id = :user_id AND tipo IN ('receita', 'despesa')");
        $stmt->execute(['id' => $id, 'user_id' => $userId]);
    }

    /** Atalho para marcar um lancamento pendente como pago hoje. */
    public static function marcarPago(PDO $pdo, int $userId, int $id): void
    {
        $stmt = $pdo->prepare(
            "UPDATE lancamentos SET status = 'pago', data_pagamento = COALESCE(data_pagamento, CURDATE())
             WHERE id = :id AND user_id = :user_id AND tipo IN ('receita', 'despesa')"
        );
        $stmt->execute(['id' => $id, 'user_id' => $userId]);
    }

    /**
     * Despesas de um periodo agrupadas pela categoria de nivel superior
     * (Fase 4 - Relatorios): se o lancamento tem uma subcategoria, a soma
     * entra na categoria-pai dela; se nao tem categoria, entra com
     * categoria_id = 0 e nome/cor nulos (o chamador decide como rotular
     * "Sem categoria", pois Models nao lidam com traducao/i18n). Ordenado
     * do maior para o menor valor.
     */
    public static function despesasPorCategoriaTopo(PDO $pdo, int $userId, string $dataInicio, string $dataFim): array
    {
        return self::porCategoriaTopo($pdo, $userId, 'despesa', $dataInicio, $dataFim);
    }

    /** Mesma logica de despesasPorCategoriaTopo(), para receitas. */
    public static function receitasPorCategoriaTopo(PDO $pdo, int $userId, string $dataInicio, string $dataFim): array
    {
        return self::porCategoriaTopo($pdo, $userId, 'receita', $dataInicio, $dataFim);
    }

    private static function porCategoriaTopo(PDO $pdo, int $userId, string $tipo, string $dataInicio, string $dataFim): array
    {
        $stmt = $pdo->prepare(
            "SELECT COALESCE(catTop.id, 0) AS categoria_id,
                    catTop.nome AS categoria_nome,
                    catTop.cor AS categoria_cor,
                    SUM(ABS(l.valor)) AS total
             FROM lancamentos l
             LEFT JOIN categorias cat ON cat.id = l.categoria_id
             LEFT JOIN categorias catTop ON catTop.id = COALESCE(cat.parent_id, cat.id)
             WHERE l.user_id = :user_id AND l.tipo = :tipo AND l.data_competencia BETWEEN :inicio AND :fim
             GROUP BY COALESCE(cat.parent_id, cat.id), catTop.nome, catTop.cor
             ORDER BY total DESC"
        );
        $stmt->execute(['user_id' => $userId, 'tipo' => $tipo, 'inicio' => $dataInicio, 'fim' => $dataFim]);
        return $stmt->fetchAll();
    }

    /**
     * Demonstrativo anual (categoria x mes) para a aba "Demonstrativo Anual"
     * dos Relatorios: agrega por categoria real (nao pela categoria de topo
     * como porCategoriaTopo()) e por mes, separado em 'receitas'/'despesas'.
     * Cada categoria de nivel superior traz 'meses' (array de 12 posicoes,
     * 1 a 12) com a soma dos lancamentos ligados DIRETAMENTE a ela (nao soma
     * as subcategorias dentro do total do pai) + 'total' + 'subcategorias'
     * (mesma estrutura). So considera tipo receita/despesa (ajuste e
     * transferencia ficam de fora, ao contrario do app de referencia, para
     * manter consistencia com o resto do sistema). Categorias de topo sem
     * nenhum lancamento no ano (nem direto nem via subcategoria) nao
     * aparecem; se uma subcategoria tem lancamentos mas a categoria-pai nao
     * tem nenhum diretamente, a categoria-pai ainda aparece como cabecalho
     * (meses todos zerados) contendo a subcategoria.
     */
    public static function demonstrativoAnual(PDO $pdo, int $userId, int $ano): array
    {
        $stmt = $pdo->prepare(
            "SELECT l.categoria_id, cat.nome, cat.cor, cat.parent_id, l.tipo,
                    MONTH(l.data_competencia) AS mes, SUM(ABS(l.valor)) AS total
             FROM lancamentos l
             LEFT JOIN categorias cat ON cat.id = l.categoria_id
             WHERE l.user_id = :user_id AND l.tipo IN ('receita', 'despesa') AND YEAR(l.data_competencia) = :ano
             GROUP BY l.categoria_id, cat.nome, cat.cor, cat.parent_id, l.tipo, MONTH(l.data_competencia)"
        );
        $stmt->execute(['user_id' => $userId, 'ano' => $ano]);
        $linhas = $stmt->fetchAll();

        $novoNo = static function (?string $nome, ?string $cor): array {
            return [
                'categoria_nome' => $nome,
                'categoria_cor'  => $cor,
                'meses'          => array_fill(1, 12, 0.0),
                'total'          => 0.0,
                'subcategorias'  => [],
            ];
        };

        $topo = ['receita' => [], 'despesa' => []];

        foreach ($linhas as $linha) {
            $tipo = $linha['tipo'];
            $mes = (int) $linha['mes'];
            $valor = (float) $linha['total'];
            $categoriaId = $linha['categoria_id'] !== null ? (int) $linha['categoria_id'] : 0;
            $parentId = $linha['parent_id'] !== null ? (int) $linha['parent_id'] : null;

            if ($parentId === null) {
                // Categoria de nivel superior, ou "sem categoria" (categoria_id nulo -> 0).
                if (!isset($topo[$tipo][$categoriaId])) {
                    $topo[$tipo][$categoriaId] = $novoNo($linha['nome'], $linha['cor']);
                }
                $topo[$tipo][$categoriaId]['meses'][$mes] += $valor;
                $topo[$tipo][$categoriaId]['total'] += $valor;
            } else {
                // Subcategoria: garante o cabecalho do pai mesmo que ele nao
                // tenha nenhum lancamento direto (busca nome/cor do pai,
                // ja que a query so trouxe dados da propria subcategoria).
                if (!isset($topo[$tipo][$parentId])) {
                    $pai = Categoria::buscarPorId($pdo, $userId, $parentId);
                    $topo[$tipo][$parentId] = $novoNo($pai['nome'] ?? null, $pai['cor'] ?? null);
                }
                if (!isset($topo[$tipo][$parentId]['subcategorias'][$categoriaId])) {
                    $topo[$tipo][$parentId]['subcategorias'][$categoriaId] = $novoNo($linha['nome'], $linha['cor']);
                }
                $topo[$tipo][$parentId]['subcategorias'][$categoriaId]['meses'][$mes] += $valor;
                $topo[$tipo][$parentId]['subcategorias'][$categoriaId]['total'] += $valor;
            }
        }

        $formatar = static function (array $porId): array {
            $lista = [];
            foreach ($porId as $id => $no) {
                $no['categoria_id'] = $id;
                $subs = [];
                foreach ($no['subcategorias'] as $subId => $sub) {
                    $sub['categoria_id'] = $subId;
                    $subs[] = $sub;
                }
                usort($subs, static fn ($a, $b) => strcmp((string) $a['categoria_nome'], (string) $b['categoria_nome']));
                $no['subcategorias'] = $subs;
                $lista[] = $no;
            }
            usort($lista, static fn ($a, $b) => strcmp((string) $a['categoria_nome'], (string) $b['categoria_nome']));
            return $lista;
        };

        // Saldo mensal (receitas - despesas), calculado direto das linhas
        // cruas para nao depender da arvore montada acima.
        $saldoMensal = array_fill(1, 12, 0.0);
        foreach ($linhas as $linha) {
            $mes = (int) $linha['mes'];
            $valor = (float) $linha['total'];
            $saldoMensal[$mes] += $linha['tipo'] === 'receita' ? $valor : -$valor;
        }

        return [
            'receitas'     => $formatar($topo['receita']),
            'despesas'     => $formatar($topo['despesa']),
            'saldo_mensal' => $saldoMensal,
        ];
    }

    /**
     * Soma diaria de receitas e despesas (valores absolutos) dentro do
     * periodo, para o grafico de frequencia dos Relatorios. Um dia sem
     * nenhum lancamento manual simplesmente nao aparece na lista.
     */
    public static function frequenciaDiaria(PDO $pdo, int $userId, string $dataInicio, string $dataFim): array
    {
        $stmt = $pdo->prepare(
            "SELECT data_competencia AS data,
                    COALESCE(SUM(CASE WHEN tipo = 'receita' THEN ABS(valor) ELSE 0 END), 0) AS receitas,
                    COALESCE(SUM(CASE WHEN tipo = 'despesa' THEN ABS(valor) ELSE 0 END), 0) AS despesas
             FROM lancamentos
             WHERE user_id = :user_id AND tipo IN ('receita', 'despesa') AND data_competencia BETWEEN :inicio AND :fim
             GROUP BY data_competencia
             ORDER BY data_competencia ASC"
        );
        $stmt->execute(['user_id' => $userId, 'inicio' => $dataInicio, 'fim' => $dataFim]);
        return $stmt->fetchAll();
    }

    /**
     * Todos os lancamentos manuais pendentes do usuario, mais antigos
     * primeiro. Independente do periodo navegado nos Relatorios - a ideia e
     * sempre mostrar tudo que ainda esta em aberto, nao so o que "vence"
     * dentro do mes selecionado (mesmo criterio usado pelo app de
     * referencia para a lista de pendencias).
     */
    public static function listarPendentes(PDO $pdo, int $userId): array
    {
        $stmt = $pdo->prepare(
            "SELECT l.*, c.nome AS conta_nome, c.cor AS conta_cor,
                    cat.nome AS categoria_nome, cat.cor AS categoria_cor
             FROM lancamentos l
             JOIN contas c ON c.id = l.conta_id
             LEFT JOIN categorias cat ON cat.id = l.categoria_id
             WHERE l.user_id = :user_id AND l.status = 'pendente' AND l.tipo IN ('receita', 'despesa')
             ORDER BY l.data_competencia ASC, l.id ASC"
        );
        $stmt->execute(['user_id' => $userId]);
        return $stmt->fetchAll();
    }

    /**
     * Cria um lancamento de ajuste de saldo (categoria nula, tipo "ajuste")
     * para fazer o saldo atual da conta bater com o valor informado pelo
     * usuario. $diferenca ja vem calculada (pode ser negativa).
     */
    public static function criarAjuste(PDO $pdo, int $userId, int $contaId, float $diferenca, string $descricao, ?int $categoriaId = null): int
    {
        $stmt = $pdo->prepare(
            "INSERT INTO lancamentos (user_id, conta_id, categoria_id, tipo, descricao, valor, data_competencia, data_pagamento, status)
             VALUES (:user_id, :conta_id, :categoria_id, 'ajuste', :descricao, :valor, CURDATE(), CURDATE(), 'pago')"
        );
        $stmt->execute([
            'user_id'      => $userId,
            'conta_id'     => $contaId,
            'categoria_id' => $categoriaId,
            'descricao'    => $descricao,
            'valor'        => $diferenca,
        ]);

        return (int) $pdo->lastInsertId();
    }

    /**
     * Cria os dois lancamentos ligados de uma transferencia entre contas
     * (saida na origem, entrada no destino) e amarra um no outro via
     * transferencia_par_id.
     */
    public static function criarTransferencia(
        PDO $pdo,
        int $userId,
        int $contaOrigemId,
        int $contaDestinoId,
        float $valor,
        string $descricao,
        string $data,
        ?int $categoriaId = null
    ): void {
        $pdo->beginTransaction();
        try {
            // OBS: MySQL/PDO (com prepares nativos) nao aceita o mesmo
            // placeholder nomeado repetido na query - por isso data_competencia
            // e data_pagamento usam :data_competencia/:data_pagamento
            // separados, mesmo recebendo o mesmo valor de $data.
            $stmt = $pdo->prepare(
                "INSERT INTO lancamentos (user_id, conta_id, categoria_id, tipo, descricao, valor, data_competencia, data_pagamento, status)
                 VALUES (:user_id, :conta_id, :categoria_id, 'transferencia', :descricao, :valor, :data_competencia, :data_pagamento, 'pago')"
            );

            $stmt->execute([
                'user_id'          => $userId,
                'conta_id'         => $contaOrigemId,
                'categoria_id'     => $categoriaId,
                'descricao'        => $descricao,
                'valor'            => -abs($valor),
                'data_competencia' => $data,
                'data_pagamento'   => $data,
            ]);
            $idOrigem = (int) $pdo->lastInsertId();

            $stmt->execute([
                'user_id'          => $userId,
                'conta_id'         => $contaDestinoId,
                'categoria_id'     => $categoriaId,
                'descricao'        => $descricao,
                'valor'            => abs($valor),
                'data_competencia' => $data,
                'data_pagamento'   => $data,
            ]);
            $idDestino = (int) $pdo->lastInsertId();

            $ligar = $pdo->prepare('UPDATE lancamentos SET transferencia_par_id = :par WHERE id = :id');
            $ligar->execute(['par' => $idDestino, 'id' => $idOrigem]);
            $ligar->execute(['par' => $idOrigem, 'id' => $idDestino]);

            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
    }
}
