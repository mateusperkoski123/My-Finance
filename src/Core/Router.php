<?php

namespace App\Core;

/**
 * Router minimalista: mapeia METODO + padrao de caminho (com {parametros})
 * para [ControllerClass::class, 'metodo'].
 */
class Router
{
    /** @var array<int, array{metodo:string, padrao:string, handler:array, regex:string, params:array}> */
    private array $rotas = [];

    public function get(string $padrao, array $handler): void
    {
        $this->adicionar('GET', $padrao, $handler);
    }

    public function post(string $padrao, array $handler): void
    {
        $this->adicionar('POST', $padrao, $handler);
    }

    private function adicionar(string $metodo, string $padrao, array $handler): void
    {
        $nomesParams = [];
        $regex = preg_replace_callback('#\{([a-zA-Z_][a-zA-Z0-9_]*)\}#', function ($m) use (&$nomesParams) {
            $nomesParams[] = $m[1];
            return '([^/]+)';
        }, $padrao);

        $this->rotas[] = [
            'metodo'  => $metodo,
            'padrao'  => $padrao,
            'handler' => $handler,
            'regex'   => '#^' . $regex . '$#',
            'params'  => $nomesParams,
        ];
    }

    public function despachar(string $metodo, string $uri): void
    {
        $caminho = parse_url($uri, PHP_URL_PATH) ?: '/';
        $caminho = rtrim($caminho, '/');
        if ($caminho === '') {
            $caminho = '/';
        }

        foreach ($this->rotas as $rota) {
            if ($rota['metodo'] !== $metodo) {
                continue;
            }
            if (preg_match($rota['regex'], $caminho, $matches)) {
                array_shift($matches);
                $args = array_combine($rota['params'], $matches);

                [$classe, $acao] = $rota['handler'];
                $controller = new $classe();
                call_user_func_array([$controller, $acao], $args);
                return;
            }
        }

        http_response_code(404);
        require __DIR__ . '/../../views/404.php';
    }
}
