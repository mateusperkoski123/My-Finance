<?php

namespace App\Core;

/**
 * Renderizacao de views PHP simples, com um layout comum para paginas
 * autenticadas (nav + tema) e um modo "isolado" para paginas sem layout
 * (login/cadastro).
 */
class View
{
    private static string $viewsPath = __DIR__ . '/../../views';

    public static function render(string $view, array $dados = [], ?array $usuarioLogado = null): void
    {
        $config = require __DIR__ . '/../../config/config.php';

        $tema   = $usuarioLogado['tema'] ?? ($_COOKIE['gf_tema'] ?? $config['tema_padrao']);
        $idioma = $usuarioLogado['idioma'] ?? ($_COOKIE['gf_idioma'] ?? $config['idioma_padrao']);
        $moeda  = $usuarioLogado['moeda'] ?? ($_COOKIE['gf_moeda'] ?? $config['moeda_padrao']);
        I18n::carregar($idioma);
        Money::definirMoeda($moeda);

        // $config e $usuarioLogado tambem ficam disponiveis dentro da view
        // interna (nao so no layout), pois varias telas (ex.: Configuracoes)
        // precisam deles para montar selects com o valor atual do usuario.
        $conteudo = self::renderizarParcial($view, $dados + [
            'config'        => $config,
            'usuarioLogado' => $usuarioLogado,
        ]);

        extract([
            'conteudo'      => $conteudo,
            'config'        => $config,
            'usuarioLogado' => $usuarioLogado,
            'tema'          => $tema,
            'idiomaAtual'   => $idioma,
            'flash'         => Flash::consumir(),
        ]);

        require self::$viewsPath . '/layout.php';
    }

    public static function renderSemLayout(string $view, array $dados = []): void
    {
        echo self::renderizarParcial($view, $dados);
    }

    private static function renderizarParcial(string $view, array $dados): string
    {
        extract($dados);
        ob_start();
        require self::$viewsPath . '/' . $view . '.php';
        return ob_get_clean();
    }
}
