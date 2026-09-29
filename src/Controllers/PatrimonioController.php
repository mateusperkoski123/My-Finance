<?php

namespace App\Controllers;

class PatrimonioController extends Controller
{
    public function index(): void
    {
        $this->render('patrimonio/index');
    }
}
